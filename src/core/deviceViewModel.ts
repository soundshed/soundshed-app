import { BluetoothDeviceInfo } from '../spork/src/interfaces/deviceController';
import { FxCatalog, FxCatalogItem, FxChangeMessage, Preset } from '../spork/src/interfaces/preset';
import { FxMappingSparkToTone } from './fxMapping';
import { Tone, ToneFxParam } from './soundshedApi';
import { FxCatalogProvider } from "../spork/src/devices/spark/sparkFxCatalog";
import { Utils } from './utils';
import { DeviceStateStore } from '../stores/devicestate';
import { platformEvents, nativeEvents } from './platformUtils';
import { DeviceContext } from './deviceContext';
import { BleProvider } from '../spork/src/devices/spark/bleProvider';
import envSettings from '../env';


// web mode


const debounce = (func, delay) => {
    let timerId;
    return (...args) => {
        const boundFunc = func.bind(this, ...args);
        clearTimeout(timerId);
        timerId = setTimeout(boundFunc, delay);
    }
}

export class DeviceViewModel {

    public statusMessage = "";

    // attached handler to be called by app model state changes and UI may have to react
    private onStateChangeHandler;

    private debouncedFXUpdate;

    private lastCommandType = "";

    // if working in web mode the device context is held here, otherwise the device context is held in the main process
    deviceContext: DeviceContext

    private defaultStateChangeHandler() {
        this.log("UI Device state change handler called but not set.")
    }

    constructor() {
        this.onStateChangeHandler = this.defaultStateChangeHandler;


        DeviceStateStore.update(s => { s.fxCatalog = FxCatalogProvider.getFxCatalog(); });

        if (envSettings.IsWebMode) {
            this.deviceContext = new DeviceContext();
            this.deviceContext.init(new BleProvider(), (type: string, msg: any) => { this.hardwareEventReceiver(type, msg); });
        }

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

        if (this.deviceContext != null) {
            platformEvents.on("perform-action", (event, args) => {
                // ... do hardware actions on behalf of the Renderer
                this.deviceContext.performAction(args);
            });
        }

        nativeEvents.on('devices-discovered', (event, args) => {
            this.onDevicesDiscovered(args);
        });

        platformEvents.on('device-state-changed', (event, args) => {
            this.log("got device state update from main.");

            // change to preset config update, ignore if is in response to fx change/toggle etc
            if (args.presetConfig && !this.lastCommandType.startsWith("requestFx")) {
                // got a preset, convert to Tone object model as required,
                let t: Tone = args.presetConfig;
                if (args.presetConfig.meta) {
                    t = new FxMappingSparkToTone().mapFrom(args.presetConfig);
                }

                DeviceStateStore.update(s => { s.presetTone = t });
            }

            if (args.lastMessageReceived) {

                if (args.lastMessageReceived.presetNumber != null) {

                    if (DeviceStateStore.getRawState().selectedChannel != args.lastMessageReceived.presetNumber) {

                        DeviceStateStore.update(s => { s.selectedChannel = args.lastMessageReceived.presetNumber });

                        // preset number has changed, refresh the details
                        this.requestPresetConfig();
                    }
                } else {
                    if (args.lastMessageReceived.dspId != null) {
                        //fx param change received from amp
                        // TODO: debounce this?

                        // find param to change and set it in our model before sending to amp
                        let presetState: Tone = Utils.deepClone(DeviceStateStore.getRawState().presetTone);

                        var fx = presetState.fx.find(f => f.type == this.expandedDspId(args.lastMessageReceived.dspId));
                        if (!fx) {
                            this.log("Updating device state for UI: " + args.lastMessageReceived.dspId + " not found in current preset state");

                            // we didn't know the preset had this fx selected,attempt to use default params from fx catalog
                            let newFx = (<FxCatalog>DeviceStateStore.getRawState().fxCatalog).catalog.find(f => f.dspId == this.expandedDspId(args.lastMessageReceived.dspId));

                            // get whatever we have in this category and update it
                            /*
                            var fx = presetState.fx.find(f => f.type == this.expandedDspId(args.lastMessageReceived.dspId));
                            fx.type = args.dspIdNew;
                            fx.name = newFx.name;

                            // repopulate fx params with defaults from fx catalog: pedal could have different parameters
                            fx.params=newFx.params.map(p=><ToneFxParam>{paramId:p.index.toString(),value:p.value, name:p.name, enabled:true})
                            */

                        }

                        if (fx) {
                            fx.params.find(p => p.paramId == args.lastMessageReceived.index).value = args.lastMessageReceived.value;
                            DeviceStateStore.update(s => { s.presetTone = presetState });
                        }


                    } else if (args.lastMessageReceived.dspIdOld != null) {
                        //fx type change received from amp
                        // TODO: debounce this? this doesn't work if you update faster than the UI state as the current preset state doesn't match

                        // find param to change and set it in our model before sending to amp
                        let presetState: Tone = Utils.deepClone(DeviceStateStore.getRawState().presetTone);

                        var fx = presetState.fx.find(f => f.type == this.expandedDspId(args.lastMessageReceived.dspIdOld));
                        if (!fx) {
                            this.log("Cannot update device state for UI: " + args.lastMessageReceived.dspId + " not found in current preset state");
                        } else {


                            fx.type = this.expandedDspId(args.lastMessageReceived.dspIdNew);
                            let catalog: FxCatalogItem[] = DeviceStateStore.getRawState().fxCatalog.catalog;
                            fx.name = catalog.find(c => c.dspId == fx.type).name;
                            DeviceStateStore.update(s => { s.presetTone = presetState });
                        }

                    }
                }
            }

            this.onStateChangeHandler();
        });

        platformEvents.on('device-connection-changed', (event, args) => {

            this.log("got connection event from main:" + args);

            if (args == "connected") {
                DeviceStateStore.update(s => { s.isConnected = true });
            }

            if (args == "failed") {
                DeviceStateStore.update(s => { s.isConnected = false, s.connectedDevice = null });
            }

            this.onStateChangeHandler();
        });
    }

    onDevicesDiscovered(deviceList) {

        DeviceStateStore.update(s => { s.devices = deviceList, s.isDeviceScanInProgress = true });

        if (deviceList.length > 0) {
            localStorage.setItem("lastKnownDevices", JSON.stringify(deviceList));
        }

        this.onStateChangeHandler();
    }

    log(msg: string) {
        console.log(msg);
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

        DeviceStateStore.update(s => { s.isDeviceScanInProgress = true });

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

        this.log("connectDevice "+ device?.address);

        if (device == null) return false;

        // inform electron main that bluetooth device selection has completed;
        if (!this.deviceInitCompleted) {
           // nativeEvents?.sendSync("perform-device-selection", device.address);
            this.deviceInitCompleted = true;
        }

        DeviceStateStore.update(s => { s.isConnectionInProgress = true, s.lastAttemptedDevice = device });
        Utils.sleepAsync(300);
        try {
            var connected = await this.deviceContext.deviceManager.connect(device);

            Utils.sleepAsync(300);

            DeviceStateStore.update(s => { s.isConnectionInProgress = false });

            if (connected) {
                // store last connected devices

                DeviceStateStore.update(s => { s.isConnected = true });

                DeviceStateStore.update(s => { s.connectedDevice = device });

                DeviceStateStore.update(s => { s.lastAttemptedDevice = null });

                localStorage.setItem("lastConnectedDevice", JSON.stringify(device));

                await this.requestCurrentChannelSelection();

                await Utils.sleepAsync(300);

                await this.requestPresetConfig();

                return true;
            } else {
                const attemptedDevice = Object.assign({}, <BluetoothDeviceInfo>DeviceStateStore.getRawState().lastAttemptedDevice);
                if (attemptedDevice) {
                    attemptedDevice.connectionFailed = true;
                    DeviceStateStore.update(s => { s.lastAttemptedDevice = attemptedDevice; s.isConnected = false; s.isConnectionInProgress = false; });
                }
                return false;
            }
            //  });
        } catch (err) {
            DeviceStateStore.update(s => { s.isConnectionInProgress = false; s.isConnected = false; });

            this.log("Failed to connect:" + err.toString());
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

    async requestPresetConfig(): Promise<boolean> {
        this.lastCommandType = "requestPresetConfig";
        await platformEvents.invoke('perform-action', { action: 'getPreset', data: DeviceStateStore.getRawState().selectedChannel }).then(
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
            () => {
                return true;
            });
        return true;
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


    async requestAmpChange(args: FxChangeMessage) {
        this.lastCommandType = "requestAmpChange";
        args.dspIdOld = this.normalizeDspId(args.dspIdOld);
        args.dspIdNew = this.normalizeDspId(args.dspIdNew);

        if (!this.isDspIdAllowed(args.dspIdNew)) {
            this.log("Selected fx id is removed or not valid : " + args.dspIdNew);
            return false;
        }


        return platformEvents.invoke('perform-action', { action: 'changeAmp', data: args }).then(
            () => {
                return true;
            });
    }


    async requestFxChange(args: FxChangeMessage) {

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
        fx.type = args.dspIdNew;
        fx.name = newFx.name;

        // repopulate fx params with defaults from fx catalog: pedal could have different parameters
        fx.params = newFx.params.map(p => <ToneFxParam>{ paramId: p.index.toString(), value: p.value, name: p.name, enabled: true })
        // TODO: also copy default params for new fx?

        DeviceStateStore.update(s => { s.presetTone = currentTone });

        args.dspIdOld = this.normalizeDspId(args.dspIdOld);
        args.dspIdNew = this.normalizeDspId(args.dspIdNew);

        return platformEvents.invoke('perform-action', { action: 'changeFx', data: args }).then(
            () => {
                return true;
            });
    }

    private async requestFxParamChangeImmediate(args) {
        this.lastCommandType = "requestFxParamChange";
        let presetState: Tone = Utils.deepClone(DeviceStateStore.getRawState().presetTone);

        // find param to change and set it in our model before sending to amp
        var fx = presetState.fx.find(f => f.type == args.dspId);
        fx.params.find(p => p.paramId == args.index).value = args.value;
        DeviceStateStore.update(s => { s.presetTone = presetState });

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

    async requestFxParamChange(args): Promise<boolean> {

        if (this.debouncedFXUpdate == null) {
            this.debouncedFXUpdate = debounce((args) => this.requestFxParamChangeImmediate(args), 50);
        }

        this.debouncedFXUpdate(args);

        return true;
    }

    async requestFxToggle(args): Promise<boolean> {

        this.lastCommandType = "requestFxToggle";

        let presetState: Tone = Utils.deepClone(DeviceStateStore.getRawState().presetTone);

        // find param to change and set it in our model before sending to amp
        presetState.fx.find(f => f.type == args.dspId).enabled = (args.value == 1);
        DeviceStateStore.update(s => { s.presetTone = presetState });

        args.dspId = this.normalizeDspId(args.dspId);

        await platformEvents.invoke('perform-action', { action: 'setFxToggle', data: args }).then(
            () => {
                this.log("Sent fx toggle change");
            });
        return true;
    }

    async setChannel(channelNum: number): Promise<boolean> {
        this.lastCommandType = "setChannel";
        try {
            await platformEvents.invoke('perform-action', { action: 'setChannel', data: channelNum });

            this.log("Completed setting channel");

            // wait then perform preset query, this is because the above channel change is not completed immediately on calling and will still get an ack
            await Utils.sleepAsync(300);

            DeviceStateStore.update(s => { s.selectedChannel = channelNum });
            this.log("...Performing follow up preset query after channel change")
            return await this.requestPresetConfig();

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
}

export default DeviceViewModel;

