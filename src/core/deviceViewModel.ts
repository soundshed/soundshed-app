import { BluetoothDeviceInfo } from '../spork/src/interfaces/deviceController';
import { DeviceState, FxCatalog, FxCatalogItem, FxChangeMessage, FxParamMessage, FxToggleMessage, Preset, PresetChangeMessage } from '../spork/src/interfaces/preset';
import { FxMappingSparkToTone, FxMappingToneToSpark } from './fxMapping';
import { Tone, ToneFxParam } from './soundshedApi';
import { FxCatalogProvider } from "../spork/src/devices/spark/sparkFxCatalog";
import { getPresetSlotsForDeviceName } from "./sparkModels";
import { Utils } from './utils';
import { DeviceStateStore } from '../stores/devicestate';
import { AppStateStore } from '../stores/appstate';
import { platformEvents, nativeEvents } from './platformUtils';
import { DeviceContext } from './deviceContext';
import { VIRTUAL_CHANNEL } from './sparkChannels';
import { BleProvider } from '../spork/src/devices/spark/bleProvider';
import { TcpProvider } from '../spork/src/devices/spark/tcpProvider';
import envSettings from '../env';
import { validatePresetName } from './presetName';

// Outcome of renaming the tone on a hardware channel. There is no rename command in the
// Spark protocol, so a rename uploads the whole preset to the slot again (same UUID)
// and then reads the slot back to check the name the amp reports.
export type RenameResult =
    | { ok: false; reason: "invalid" | "not-connected" | "not-hardware" | "channel-changed" | "not-loaded" | "store-failed" }
    | { ok: true; check: "confirmed" | "mismatch" | "unconfirmed"; reportedName?: string };

type NameCheckResult = { check: "confirmed" | "mismatch" | "unconfirmed"; reportedName?: string };

export class DeviceViewModel {

    public statusMessage = "";

    static getPresetSlotsForDevice(deviceName: string): number {
        return getPresetSlotsForDeviceName(deviceName);
    }

    // attached handler to be called by app model state changes and UI may have to react
    private onStateChangeHandler;

    // Param changes are coalesced per (dspId, param index) while a send for that param
    // is in flight. A single shared debounce used to drop all but the last change when
    // two knobs moved together, and a fixed-interval throttle queued far more sends than
    // BLE can deliver (about 2 commands/s), so every later command waited seconds behind
    // a knob drag. Here at most one send per param is in flight and at most one more is
    // waiting (only the latest value), and the final value is always sent.
    private fxParamSends = new Map<string, { pending: any }>();

    private lastCommandType = "";

    // When a tone was last uploaded to the virtual channel. Used to ignore the amp's
    // echo of its hardware slot immediately afterwards, without permanently ignoring
    // genuine channel changes the user makes on the amp itself.
    private lastVirtualChannelApplyTime = 0;

    private static readonly virtualChannelEchoWindowMs = 4000;

    private isVirtualChannelToneLive(): boolean {
        return DeviceStateStore.getRawState().selectedChannel == VIRTUAL_CHANNEL
            && (Date.now() - this.lastVirtualChannelApplyTime) < DeviceViewModel.virtualChannelEchoWindowMs;
    }

    private lastChannelChange = null;

    // How long a rename waits for the amp to report the slot back. Static so tests can
    // shorten it.
    static nameCheckTimeoutMs = 3000;

    // A read-back of a slot after a save with a new name, resolved by the next preset
    // the amp reports for that slot (or as "unconfirmed" on timeout).
    private pendingNameCheck: { slot: number, name: string, resolve: (r: NameCheckResult) => void } | null = null;

    private isHardwareSlot(channel: number): boolean {
        return Number.isInteger(channel) && channel >= 0 && channel < AppStateStore.getRawState().numPresetSlots;
    }

    // Sets the selected channel and, for a real hardware slot, remembers it as the last
    // hardware channel. The virtual channel (0x7f) never replaces that.
    private setSelectedChannel(channel: number) {
        DeviceStateStore.update(s => {
            // a switched channel loads its stored preset, so nothing on screen is unsaved;
            // until that preset arrives the tone on screen is still the previous one's
            if (s.selectedChannel != channel) {
                s.hasUnsavedEdits = false;
                s.presetToneSlot = null;
            }
            s.selectedChannel = channel;
            if (this.isHardwareSlot(channel)) {
                s.lastHardwareChannel = channel;
            }
        });
    }

    // if working in web mode the device context is held here, otherwise the device context is held in the main process
    deviceContext: DeviceContext

    private defaultStateChangeHandler() {
        this.log("UI Device state change handler called but not set.")
    }

    constructor() {
        this.onStateChangeHandler = this.defaultStateChangeHandler;

        DeviceStateStore.update(s => { s.fxCatalog = FxCatalogProvider.getFxCatalog(); });

        this.deviceContext = new DeviceContext();

        const transport = (envSettings.SparkTransport || "ble").toLowerCase();
        const provider = transport === "tcp-sim"
            ? new TcpProvider({
                host: envSettings.SparkSimulatorHost || "127.0.0.1",
                port: envSettings.SparkSimulatorPort || 9124,
                model: envSettings.SparkSimulatorModel || "spark-2",
                verbose: !!envSettings.SparkSimulatorVerbose
            })
            : new BleProvider();

        this.deviceContext.init(provider, (type: string, msg: any) => { this.hardwareEventReceiver(type, msg); });

        this.setupEventListeners();
    }

    hardwareEventReceiver(type: string, msg: any) {
        this.log("Device VM event received: " + type);
        platformEvents.invoke(type, msg);
        //this.deviceContext.performAction({ action: type, args: msg });
    }

    addStateChangeListener(onViewModelStateChange) {
        this.onStateChangeHandler = onViewModelStateChange;
    }

    removeStateChangeListener() {
        this.onStateChangeHandler = this.defaultStateChangeHandler;
    }

    setupEventListeners() {
        // setup event listeners for main electron app events (native bluetooth data state, device state responses, device list etc)

        const registerRuntimeEvent = (type: string, handler: (event: any, args: any) => void) => {
            platformEvents.on(type, handler);

            const nativeEvt = nativeEvents as any;
            const platformEvt = platformEvents as any;
            if (nativeEvt && nativeEvt !== platformEvt && typeof nativeEvt.on === "function") {
                nativeEvt.on(type, handler);
            }
        };

        if (this.deviceContext != null) {
            platformEvents.on("perform-action", (event, args) => {
                // ... do hardware actions on behalf of the Renderer
                // Returned so invoke() resolves only once the action completes.
                return this.deviceContext.performAction(args);
            });
        }

        registerRuntimeEvent('devices-discovered', (event, args) => {
            this.onDevicesDiscovered(args);
        });

        registerRuntimeEvent('device-state-changed', (event, args: DeviceState) => {
            this.log("got device state update from main.");

            // change to preset config update, ignore if is in response to fx change/toggle etc
            if (args.presetConfig && !this.lastCommandType.startsWith("requestFx")) {

                // Ignore preset data from the amp while a freshly applied tone is live on
                // the virtual channel. A Spark 2 answers a query for channel 0x7f with the
                // contents of its currently selected *hardware* slot, which would replace
                // the tone the user just loaded with that slot's stored preset.
                if (this.isVirtualChannelToneLive()) {
                    this.log("Ignoring preset data from the amp, an applied tone is live on the virtual channel");
                } else if (!args.message || args.message.type == 'preset') {
                    // The reader keeps the last preset it parsed and sends it along with
                    // every later message (fx_param_msg, hardware_bpm, tuner_output, ...), so
                    // only a preset reply (or an event with no message) says anything new.
                    // Replacing the tone from the repeated copy would undo a rename or an
                    // edit made since, so those messages are applied to the current tone
                    // below instead.

                    // got a preset, convert to Tone object model as required,
                    let t: Tone;
                    if (args.presetConfig.meta) {
                        t = new FxMappingSparkToTone().mapFrom(args.presetConfig);
                        // Keep the amp's UUID (the mapping makes a new one): a channel
                        // rename stores the tone again under this id, and a favourite of
                        // the same preset is matched by it.
                        const ampId = args.presetConfig.meta.id;
                        if (t != null && typeof ampId == "string" && ampId.trim() != "") {
                            t.toneId = ampId;
                        }
                    } else {
                        t = <Tone>args.presetConfig;
                    }

                    const selected = DeviceStateStore.getRawState().selectedChannel;

                    DeviceStateStore.update(s => {
                        s.presetTone = t;
                        // the same assumption as slotNames: this preset is the selected channel's
                        s.presetToneSlot = this.isHardwareSlot(selected) ? selected : null;
                        if (this.isHardwareSlot(selected) && t?.name != null) {
                            s.slotNames[selected] = t.name;
                        }
                    });

                    const check = this.pendingNameCheck;
                    if (check && selected == check.slot) {
                        const reported = (t?.name ?? "").trim();
                        check.resolve(reported == check.name
                            ? { check: "confirmed", reportedName: reported }
                            : { check: "mismatch", reportedName: reported });
                    }
                }
            }

            if (args.message) {
                let message = args.message;
                if (message.type == 'hardware_channel_current') {
                    let presetChange = <PresetChangeMessage>message;

                    this.log(`hardware_channel_current: amp reports ${presetChange.presetNumber}, UI on ${DeviceStateStore.getRawState().selectedChannel}`);

                    if (DeviceStateStore.getRawState().selectedChannel != presetChange.presetNumber) {

                        // Ignore the amp's echo of its hardware slot while a freshly applied
                        // tone is live on the virtual channel. The amp reports a real slot
                        // number here, and acting on it would switch the UI back to that
                        // slot's stored preset and overwrite the tone the user just loaded.
                        if (this.isVirtualChannelToneLive()) {
                            this.log("Ignoring hardware channel echo, an applied tone is live on the virtual channel");
                            return;
                        }

                        this.setSelectedChannel(presetChange.presetNumber);

                        // preset number has changed, refresh the details
                        this.requestPresetConfig(presetChange.presetNumber);
                    }

                } else if (message.type == 'hardware_preset_stored') {
                    // the amp stored its current tone (e.g. a held preset button)
                    let stored = <PresetChangeMessage>message;
                    if (stored.presetNumber == DeviceStateStore.getRawState().selectedChannel) {
                        DeviceStateStore.update(s => { s.hasUnsavedEdits = false; });
                    }
                } else {
                    if (message.type == 'fx_param_msg' || message.type == 'fx_change_msg' || message.type == 'fx_toggled') {
                        // an edit made on the amp itself (or a footswitch)
                        DeviceStateStore.update(s => { s.hasUnsavedEdits = true; });
                    }

                    if (message.type == 'fx_toggled') {
                        // a block switched on or off on the amp: keep the tone on screen in
                        // step, so a later upload (Save, channel rename) doesn't revert it
                        let msg = <FxToggleMessage>message;
                        let presetState: Tone = Utils.deepClone(DeviceStateStore.getRawState().presetTone);
                        const fx = this.findFxForAmpDspId(presetState, msg.dspId);
                        if (fx) {
                            fx.enabled = msg.active == true;
                            DeviceStateStore.update(s => { s.presetTone = presetState });
                        } else {
                            this.log(`Cannot update device state for UI: ${msg.dspId} not found in current preset state`);
                        }
                    } else if (message.type == 'fx_param_msg') {
                        //fx param change received from amp
                        // TODO: debounce this?
                        let msg = <FxParamMessage>message;

                        // find param to change and set it in our model before sending to amp
                        let presetState: Tone = Utils.deepClone(DeviceStateStore.getRawState().presetTone);

                        var fx = presetState.fx.find(f => f.type == this.expandedDspId(msg.dspId));

                        if (!fx) {
                            this.log("Updating device state for UI: " + msg.dspId + " not found in current preset state");

                            // we didn't know the preset had this fx selected,attempt to use default params from fx catalog
                            let newFx = (<FxCatalog>DeviceStateStore.getRawState().fxCatalog).catalog.find(f => f.dspId == this.expandedDspId(msg.dspId));

                            // get whatever we have in this category and update it
                            /*
                            var fx = presetState.fx.find(f => f.type == this.expandedDspId(message.dspId));
                            fx.type = args.dspIdNew;
                            fx.name = newFx.name;

                            // repopulate fx params with defaults from fx catalog: pedal could have different parameters
                            fx.params=newFx.params.map(p=><ToneFxParam>{paramId:p.index.toString(),value:p.value, name:p.name, enabled:true})
                            */

                        }

                        if (fx) {
                            fx.params.find(p => p.paramId == msg.index.toString()).value = message.value;
                            DeviceStateStore.update(s => { s.presetTone = presetState });
                        }

                    } else if (message.type == 'fx_change_msg') {
                        //fx type change received from amp

                        let msg = <FxChangeMessage>message;
                        // TODO: debounce this? this doesn't work if you update faster than the UI state as the current preset state doesn't match

                        // find param to change and set it in our model before sending to amp
                        let presetState: Tone = Utils.deepClone(DeviceStateStore.getRawState().presetTone);

                        var fx = presetState.fx.find(f => f.type == this.expandedDspId(msg.dspIdOld));

                        if (!fx) {
                            this.log(`Cannot update device state for UI: ${msg.dspIdOld} not found in current preset state`);
                        } else {

                            fx.type = this.expandedDspId(msg.dspIdNew);
                            let catalog: FxCatalogItem[] = DeviceStateStore.getRawState().fxCatalog.catalog;
                            // the amp may switch to a model the catalog doesn't know yet
                            fx.name = catalog.find(c => c.dspId == fx.type)?.name ?? msg.dspIdNew;
                            DeviceStateStore.update(s => { s.presetTone = presetState });
                        }

                    }
                }
            }

            this.onStateChangeHandler();
        });

        registerRuntimeEvent('device-connection-changed', (event, args) => {

            this.log("got connection event from main:" + args);

            if (args == "connected") {
                DeviceStateStore.update(s => { s.isConnected = true; s.isConnectionInProgress = false; s.deviceConnectionFailed = false; s.connectionLost = false; });
            }

            if (args == "failed") {
                DeviceStateStore.update(s => { s.isConnected = false; s.connectedDevice = null; s.isConnectionInProgress = false; });
            }

            if (args == "disconnected") {
                // Unexpected BLE drop. 'reconnecting' is sent separately if a retry kicks off.
                DeviceStateStore.update(s => { s.isConnected = false; s.connectionLost = true; });
            }

            if (args == "reconnecting") {
                DeviceStateStore.update(s => { s.isConnectionInProgress = true; });
            }

            this.onStateChangeHandler();
        });
    }

    onDevicesDiscovered(deviceList) {

        DeviceStateStore.update(s => { s.devices = deviceList, s.isDeviceScanInProgress = true });

        if (deviceList.length > 0) {
            localStorage.setItem("lastKnownDevices", JSON.stringify(deviceList));
        } else {
            DeviceStateStore.update(s => { s.isDeviceScanInProgress = false, s.deviceScanFailed = true });

        }

        this.onStateChangeHandler();
    }

    log(msg: string) {
        console.debug(msg);
    }

    getLastKnownDevices() {
        let d = localStorage.getItem("lastKnownDevices");

        if (d) {
            return JSON.parse(d);
        } else {
            return [];
        }
    }

    async scanForDevices(): Promise<boolean> {

        this.log("BLE scanning");

        DeviceStateStore.update(s => { s.isDeviceScanInProgress = true, s.deviceScanFailed = false, s.deviceConnectionFailed = false });

        await platformEvents.invoke('perform-action', { action: 'scan' });

        return true;
    }

    getLastConnectedDevice(): BluetoothDeviceInfo {

        return null;
        /*
        let deviceJson = localStorage.getItem("lastConnectedDevice");
        if (deviceJson) {
            return <BluetoothDeviceInfo>JSON.parse(deviceJson);
        } else {
            return null;
        }*/
    }

    deviceInitCompleted = false;

    async connectDevice(device: BluetoothDeviceInfo): Promise<boolean> {

        this.log("connectDevice " + device?.address);

        if (device == null) return false;

        // inform electron main that bluetooth device selection has completed;
        if (!this.deviceInitCompleted) {
            // nativeEvents?.sendSync("perform-device-selection", device.address);
            this.deviceInitCompleted = true;
        }

        // A new attempt clears the previous failure. It was never reset before, and while
        // set the device selector hid the device list and its Connect buttons, so the only
        // way to try again was to reload the app.
        DeviceStateStore.update(s => { s.isConnectionInProgress = true, s.lastAttemptedDevice = device, s.deviceConnectionFailed = false });

        try {
            var connected = await this.deviceContext.deviceManager.connect(device);

            DeviceStateStore.update(s => { s.isConnectionInProgress = false });

            if (connected) {
                // store last connected devices

                DeviceStateStore.update(s => { s.isConnected = true; s.connectedDevice = device; s.lastAttemptedDevice = null; s.deviceConnectionFailed = false; s.connectionLost = false; s.hasUnsavedEdits = false; s.slotNames = {}; s.lastNameCheck = null; s.presetToneSlot = null; });

                // auto-select preset slots based on connected device name
                const slots = DeviceViewModel.getPresetSlotsForDevice(device.name);
                AppStateStore.update(s => { s.numPresetSlots = slots; });

                localStorage.setItem("lastConnectedDevice", JSON.stringify(device));

                await this.requestCurrentChannelSelection();

                let maxWait = 50;
                while(maxWait > 0 && DeviceStateStore.getRawState().selectedChannel < 0)
                {
                    console.log("waiting for channel selection info");
                    await Utils.sleepAsync(100);
                    maxWait--;
                }

                // request the current preset config so the UI can display the signal chain
                const currentChannel = DeviceStateStore.getRawState().selectedChannel;
                await this.requestPresetConfig(currentChannel >= 0 ? currentChannel : 0);

                return true;
            } else {
                if ((envSettings.SparkTransport || "").toLowerCase() === "tcp-sim") {
                    this.log(`TCP simulator connection failed. target=${envSettings.SparkSimulatorHost}:${envSettings.SparkSimulatorPort}, IsWebMode=${envSettings.IsWebMode}`);
                    if (envSettings.IsWebMode) {
                        this.log("tcp-sim requires Electron mode. Set IsWebMode=false and use platformUtils.electron import.");
                    }
                }

                const attemptedDevice = Object.assign({}, <BluetoothDeviceInfo>DeviceStateStore.getRawState().lastAttemptedDevice);
                if (attemptedDevice) {
                    attemptedDevice.connectionFailed = true;
                    DeviceStateStore.update(s => { s.lastAttemptedDevice = attemptedDevice; s.isDeviceScanInProgress = false; s.isConnected = false; s.isConnectionInProgress = false; s.deviceConnectionFailed = true; });
                }
                return false;
            }

        } catch (err) {
            DeviceStateStore.update(s => { s.isConnectionInProgress = false; s.isDeviceScanInProgress = false; s.isConnected = false; s.deviceConnectionFailed = true; });

            this.log("Failed to connect:" + err.toString());
            if ((envSettings.SparkTransport || "").toLowerCase() === "tcp-sim") {
                this.log(`TCP connect exception context: target=${envSettings.SparkSimulatorHost}:${envSettings.SparkSimulatorPort}, IsWebMode=${envSettings.IsWebMode}`);
            }
            return false;
        }

    }

    async requestCurrentChannelSelection(): Promise<boolean> {
        this.lastCommandType = "requestCurrentChannelSelection";
        await platformEvents.invoke('perform-action', { action: 'getCurrentChannel', data: 0 }).then(
            () => {
                this.log("Completed channel selection query");
            });
        return true;
    }

    async requestPresetConfig(channelNum: number = null): Promise<boolean> {
        this.lastCommandType = "requestPresetConfig";

        await platformEvents.invoke('perform-action', { action: 'getPreset', data: channelNum != null ? channelNum : VIRTUAL_CHANNEL }).then(
            () => {
                this.log("Completed preset query");
            });
        return true;
    }


    isDspIdAllowed(dspId: string): boolean {
        let db = FxCatalogProvider.getFxCatalog();
        let fx = db.catalog.find(c => c.dspId == FxMappingSparkToTone.mapFxId(dspId) && c.isRemoved == true);
        if (fx != null) {
            this.log("DSP id has been removed, Cannot activate preset. " + dspId);
            return false;
        } else {
            return true;
        }
    }

    async requestPresetChange(args: Preset) {

        if (args == null) {
            return;
        }

        // check for invalid dsp IDs (old experimental fx) which would crash amp
        if (args.sigpath != null) {
            let db = FxCatalogProvider.getFxCatalog();
            for (let p of args.sigpath) {
                let fx = db.catalog.find(c => c.dspId == FxMappingSparkToTone.mapFxId(p.dspId) && c.isRemoved == true);
                if (fx != null) {
                    this.log("DSP id has been removed, Cannot activate preset. " + p.dspId);
                    return false;
                }
            }
        }

        this.lastCommandType = "requestPresetChange";
        return platformEvents.invoke('perform-action', { action: 'applyPreset', data: args }).then(
            (result) => {
                const applied = result !== false;

                if (applied) {
                    // Reflect the tone we just uploaded straight away. We know exactly what
                    // was sent, so the UI must not depend on the amp echoing preset 0x7f
                    // back — a Spark 2 does not reliably answer a query for the virtual
                    // channel, which used to leave the previous tone's name and knobs on
                    // screen. Any later response from the amp still refines this.
                    this.lastVirtualChannelApplyTime = Date.now();

                    try {
                        const tone = args.meta ? new FxMappingSparkToTone().mapFrom(args) : <Tone><any>args;

                        DeviceStateStore.update(s => {
                            s.presetTone = tone;
                            s.selectedChannel = VIRTUAL_CHANNEL;
                            // the applied tone is "Live", a marker that already says it isn't stored
                            s.hasUnsavedEdits = false;
                            s.presetToneSlot = null;
                        });
                    } catch (err) {
                        // The tone is already on the amp; a display mapping failure must not
                        // turn a successful apply into a reported failure.
                        this.log("Could not map the applied tone for display: " + err);
                    }
                }

                return applied;
            });
    }

    public normalizeDspId(dspId: string) {
        var d = dspId?.replace("pg.spark40.", "") ?? dspId;

        if (d.startsWith("bias.reverb")) {
            d = "bias.reverb";
        }
        return d;
    }

    public expandedDspId(dspId: string) {
        return "pg.spark40." + dspId;
    }

    // The block in a tone for a dspId the amp reports (unprefixed). The amp reports any
    // reverb as "bias.reverb"; the tone holds it as "pg.spark40.bias.reverb.<variant>".
    private findFxForAmpDspId(tone: Tone, dspId: string) {
        if (tone?.fx == null || dspId == null) return undefined;
        const type = this.expandedDspId(dspId.replace("pg.spark40.", ""));
        return tone.fx.find(f => f.type == type)
            ?? (dspId.endsWith("bias.reverb") ? tone.fx.find(f => f.type?.startsWith(type + ".")) : undefined);
    }


    async requestAmpChange(args: FxChangeMessage) {
        this.lastCommandType = "requestAmpChange";
        args.dspIdOld = this.normalizeDspId(args.dspIdOld);
        args.dspIdNew = this.normalizeDspId(args.dspIdNew);

        if (!this.isDspIdAllowed(args.dspIdNew)) {
            this.log("Selected fx id is removed or not valid : " + args.dspIdNew);
            return false;
        }


        DeviceStateStore.update(s => { s.hasUnsavedEdits = true; });

        return platformEvents.invoke('perform-action', { action: 'changeAmp', data: args }).then(
            () => {
                return true;
            });
    }


    async requestFxChange(args: FxChangeMessage) {

        // Nothing reports a failed write back to us, so without a connection the change
        // would look applied while the amp never got it.
        if (!DeviceStateStore.getRawState().isConnected) {
            this.log("Cannot change fx, no amp connected");
            return false;
        }

        this.lastCommandType = "requestFxChange";

        if (!this.isDspIdAllowed(args.dspIdNew)) {
            this.log("Selected fx id is removed or not valid : " + args.dspIdNew);
            return false;
        }


        // TODO: special case for reverb
        if (args.dspIdOld == "bias.reverb") {
            return this.requestFxParamChange({ "dspId": "bias.reverb", "index": 6, value: 0.4 });
        }


        var currentTone: Tone = Utils.deepClone(DeviceStateStore.getRawState().presetTone);

        let newFx = (<FxCatalog>DeviceStateStore.getRawState().fxCatalog).catalog.find(f => f.dspId == args.dspIdNew);

        var fx = currentTone.fx.find(f => f.type == args.dspIdOld);

        if (!newFx || !fx) {
            this.log("Cannot change fx, unknown fx id or fx not in current preset: " + args.dspIdOld + " -> " + args.dspIdNew);
            return false;
        }

        fx.type = args.dspIdNew;
        fx.name = newFx.name;

        // repopulate fx params with defaults from fx catalog: pedal could have different parameters.
        // Some catalog models have no known defaults (null); keep the current value at that
        // index so the knob doesn't jump, or fall back to the middle of the range.
        const previousParams = fx.params ?? [];
        fx.params = newFx.params.map(p => {
            let value = p.value;
            if (value == null) {
                value = previousParams.find(c => c.paramId == p.index.toString())?.value ?? 0.5;
            }
            return <ToneFxParam>{ paramId: p.index.toString(), value: value, name: p.name, enabled: true };
        })
        // TODO: also copy default params for new fx?

        DeviceStateStore.update(s => { s.presetTone = currentTone });

        args.dspIdOld = this.normalizeDspId(args.dspIdOld);
        args.dspIdNew = this.normalizeDspId(args.dspIdNew);

        return platformEvents.invoke('perform-action', { action: 'changeFx', data: args }).then(
            () => {
                DeviceStateStore.update(s => { s.hasUnsavedEdits = true; });
                return true;
            });
    }

    async requestFxParamChangeImmediate(args) {
        this.lastCommandType = "requestFxParamChange";
        let presetState: Tone = Utils.deepClone(DeviceStateStore.getRawState().presetTone);

        // find param to change and set it in our model before sending to amp
        var fx = presetState.fx.find(f => f.type == args.dspId);
        fx.params.find(p => p.paramId == args.index).value = args.value;
        // MIDI sends here directly, so this marks the tone edited as well
        DeviceStateStore.update(s => { s.presetTone = presetState; s.hasUnsavedEdits = true; });

        args.dspId = this.normalizeDspId(args.dspId);

        if (typeof (args.value) == "string") {
            args.value = parseInt(args.value);
        }

        if (typeof (args.index) == "string") {
            args.index = parseInt(args.index);
        }

        return platformEvents.invoke('perform-action', { action: 'setFxParam', data: args }).then(
            () => {
                return true;
            });

    }

    // Coalesced param change for continuous controls (knob drags, wheel, key repeat).
    // Resolves once the change is queued, not when the amp has received it. The store
    // is updated when a value is actually sent (by requestFxParamChangeImmediate).
    async requestFxParamChange(args): Promise<boolean> {

        // marked at request time: the send itself may wait behind a coalesced one
        if (!DeviceStateStore.getRawState().hasUnsavedEdits) {
            DeviceStateStore.update(s => { s.hasUnsavedEdits = true; });
        }

        const key = this.normalizeDspId(args.dspId) + ":" + args.index;
        const inFlight = this.fxParamSends.get(key);

        if (inFlight) {
            // a send for this param is still in flight: keep only the latest value
            inFlight.pending = { ...args };
            return true;
        }

        this.sendCoalescedFxParam(key, { ...args });

        return true;
    }

    private sendCoalescedFxParam(key: string, args) {
        const entry = { pending: null };
        this.fxParamSends.set(key, entry);

        // not awaited by the caller, so failures are logged rather than left as unhandled rejections
        this.requestFxParamChangeImmediate(args)
            .catch(err => {
                this.log("Failed to send fx param change: " + err);
            })
            .then(() => {
                // the previous send settled: send the latest value that arrived meanwhile, if any
                if (entry.pending != null) {
                    this.sendCoalescedFxParam(key, entry.pending);
                } else {
                    this.fxParamSends.delete(key);
                }
            });
    }

    async requestFxToggle(args): Promise<boolean> {

        this.lastCommandType = "requestFxToggle";

        let presetState: Tone = Utils.deepClone(DeviceStateStore.getRawState().presetTone);

        // find param to change and set it in our model before sending to amp
        presetState.fx.find(f => f.type == args.dspId).enabled = (args.value == 1);
        DeviceStateStore.update(s => { s.presetTone = presetState; s.hasUnsavedEdits = true; });

        args.dspId = this.normalizeDspId(args.dspId);

        await platformEvents.invoke('perform-action', { action: 'setFxToggle', data: args }).then(
            () => {
                this.log("Sent fx toggle change");
            });
        return true;
    }

    async setChannel(channelNum: number): Promise<boolean> {

        if (this.lastChannelChange != null) {
            let currentTime = new Date();

            var secondsSinceLastRequest = (currentTime.getTime() - this.lastChannelChange.getTime()) / 1000;
            if (secondsSinceLastRequest < 1) {
                return false;
            } else {
                this.lastChannelChange = currentTime;
            }

        } else {
            this.lastChannelChange = new Date();
        }

        this.lastCommandType = "setChannel";
        try {
            await platformEvents.invoke('perform-action', { action: 'setChannel', data: channelNum });

            this.log("Completed setting channel");

            // wait then perform preset query, this is because the above channel change is not completed immediately on calling and will still get an ack
            await Utils.sleepAsync(100);

            this.setSelectedChannel(channelNum);

            this.log("...Performing follow up preset query after channel change");

            return await this.requestPresetConfig(channelNum);

        } catch {
            return false;
        }
    }

    async getDeviceName(): Promise<boolean> {
        await platformEvents.invoke('perform-action', { action: 'getDeviceName', data: {} }).then(
            () => {

            });
        return true;
    }

    async getDeviceSerial(): Promise<boolean> {
        await platformEvents.invoke('perform-action', { action: 'getDeviceSerial', data: {} }).then(
            () => {

            });
        return true;
    }

    // Stores the current tone on a hardware slot, optionally under a new name. Used by
    // Save to Amp. When the name changed and the slot is the selected channel, the slot
    // is read back in the background and a different reported name lands in
    // DeviceStateStore.lastNameCheck.
    async storeCurrentPreset(presetNum: number, name?: string): Promise<boolean> {

        const previousName: string | undefined = DeviceStateStore.getRawState().presetTone?.name;
        const stored = await this.storeTone(presetNum, name);

        if (stored != null && name !== undefined && stored != previousName
            && presetNum == DeviceStateStore.getRawState().selectedChannel) {
            void this.checkSlotName(presetNum, stored).then(r => {
                if (r.check == "mismatch") {
                    DeviceStateStore.update(s => { s.lastNameCheck = { slot: presetNum, expected: stored, reported: r.reportedName ?? "" }; });
                }
            });
        }

        return stored != null;
    }

    // Renames the tone on screen only. Nothing is sent: the name goes to the amp with
    // the next Save to Amp.
    renameTone(name: string): boolean {
        const tone = DeviceStateStore.getRawState().presetTone;
        const v = validatePresetName(name);
        if (tone == null || !v.ok) {
            return false;
        }

        const renamed: Tone = Utils.deepClone(tone);
        renamed.name = v.name;
        DeviceStateStore.update(s => { s.presetTone = renamed; });
        return true;
    }

    // Renames the selected hardware channel on the amp. The Spark protocol has no rename
    // command, so this stores the whole current tone (same UUID) to the slot under the
    // new name, including any unsaved edits, then reads the slot back. Refused until the
    // selected channel's preset has loaded from the amp (see presetToneSlot).
    async renameChannelPreset(slot: number, name: string): Promise<RenameResult> {

        const v = validatePresetName(name);
        if (!v.ok) {
            return { ok: false, reason: "invalid" };
        }

        const state = DeviceStateStore.getRawState();
        if (!state.isConnected) {
            return { ok: false, reason: "not-connected" };
        }
        if (!this.isHardwareSlot(slot)) {
            return { ok: false, reason: "not-hardware" };
        }
        // the dialog captured the channel when it opened; never write to another one
        if (slot != state.selectedChannel) {
            return { ok: false, reason: "channel-changed" };
        }
        // The upload is the tone on screen. Right after a channel switch (or when the
        // amp's preset reply was dropped) that is still the previous channel's tone, and
        // storing it would overwrite this channel's sound with another one's.
        if (state.presetToneSlot !== slot) {
            return { ok: false, reason: "not-loaded" };
        }

        const stored = await this.storeTone(slot, v.name);
        if (stored == null) {
            return { ok: false, reason: "store-failed" };
        }

        const check = await this.checkSlotName(slot, stored);
        return { ok: true, ...check };
    }

    // The shared store path. Returns the name the tone was stored under, or null when
    // nothing was stored.
    private async storeTone(presetNum: number, name?: string): Promise<string | null> {

        // A write with no amp connected is swallowed further down and would be reported
        // as a successful save.
        if (!DeviceStateStore.getRawState().isConnected) {
            this.log("Cannot store preset, no amp connected");
            return null;
        }

        // Only real hardware slots can be written. The virtual channel (0x7f) is where an
        // applied, unsaved tone lives, and storing to it is not a save the user can get back.
        if (!this.isHardwareSlot(presetNum)) {
            this.log("Cannot store preset, not a hardware slot: " + presetNum);
            return null;
        }

        let newName: string | undefined;
        if (name !== undefined) {
            const v = validatePresetName(name);
            if ("error" in v) {
                this.log("Cannot store preset, invalid name: " + v.error);
                return null;
            }
            newName = v.name;
        }

        this.lastCommandType = "requestPresetChange";
        let presetState: Tone = Utils.deepClone(DeviceStateStore.getRawState().presetTone);

        try {
            if (newName !== undefined) {
                presetState.name = newName;
            }
            // meta.id (the UUID) comes from toneId, so a rename keeps the same preset id
            let p = new FxMappingToneToSpark().mapFrom(presetState);

            const result = await platformEvents.invoke('perform-action', { action: 'storePreset', data: [p, presetNum] });
            if (result === false) {
                return null;
            }
        } catch (err) {
            this.log("Failed to store preset: " + err);
            return null;
        }

        DeviceStateStore.update(s => {
            if (newName !== undefined && s.presetTone != null && s.presetTone.toneId == presetState.toneId) {
                s.presetTone.name = newName;
            }
            s.slotNames[presetNum] = presetState.name;
            if (presetNum == s.selectedChannel) {
                s.hasUnsavedEdits = false;
                // the selected slot now holds the tone on screen
                if (s.presetTone != null && s.presetTone.toneId == presetState.toneId) {
                    s.presetToneSlot = presetNum;
                }
            }
        });

        return presetState.name;
    }

    // Reads the slot back and compares the name the amp reports. The amp's version
    // replaces the tone on screen through the device-state-changed handler.
    private checkSlotName(slot: number, name: string): Promise<NameCheckResult> {

        // only one read-back at a time; an older one can no longer be matched
        this.pendingNameCheck?.resolve({ check: "unconfirmed" });

        return new Promise<NameCheckResult>(resolve => {
            let settled = false;
            let timer: ReturnType<typeof setTimeout> | null = null;

            const check = {
                slot,
                name,
                resolve: (r: NameCheckResult) => {
                    if (settled) return;
                    settled = true;
                    if (timer != null) clearTimeout(timer);
                    if (this.pendingNameCheck === check) this.pendingNameCheck = null;
                    resolve(r);
                }
            };

            this.pendingNameCheck = check;
            timer = setTimeout(() => check.resolve({ check: "unconfirmed" }), DeviceViewModel.nameCheckTimeoutMs);

            this.requestPresetConfig(slot).catch(err => {
                this.log("Failed to read the slot back: " + err);
            });
        });
    }
}

export default DeviceViewModel;

