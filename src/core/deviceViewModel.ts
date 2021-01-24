import { ipcRenderer } from 'electron';
import { appendFileSync } from 'fs';
import { BluetoothDeviceInfo } from '../spork/src/interfaces/deviceController';
import { FxChangeMessage, Preset } from '../spork/src/interfaces/preset';

const debounce = (func, delay) => {
    let timerId;
    return (...args) => {
        const boundFunc = func.bind(this, ...args);
        clearTimeout(timerId);
        timerId = setTimeout(boundFunc, delay);
    }
}
export class DeviceViewModel {

    public isConnected: boolean = false;
    public preset: Preset = {};
    public selectedChannel: number = -1;
    public devices: BluetoothDeviceInfo[];

    public storedPresets: Preset[] = [];

    public messages = [];
    public statusMessage = "";

    // attached handler to be called by app model state changes and UI may have to react
    private onStateChangeHandler;

    private debouncedFXUpdate;

    private defaultStateChangeHandler() {
        this.log("UI Device state change handler called but not set.")
    }

    constructor() {
        this.onStateChangeHandler = this.defaultStateChangeHandler;

        this.setupElectronIPCListeners();
    }

    addStateChangeListener(onViewModelStateChange) {
        this.onStateChangeHandler = onViewModelStateChange;
    }

    removeStateChangeListener() {
        this.onStateChangeHandler = this.defaultStateChangeHandler;
    }

    setupElectronIPCListeners() {
        // setup event listeners for main electron app events (native bluetooth data state, device state responses, device list etc)
        ipcRenderer.on('device-state-changed', (event, args) => {
            this.log("got device state update from main.");

            if (args.presetConfig) {
                this.preset = args.presetConfig;
            }

            if (args.lastMessageReceived) {
                this.messages.push(args.lastMessageReceived);

                if (args.lastMessageReceived.presetNumber && args.lastMessageReceived.presetNumber != this.selectedChannel) {
                    this.selectedChannel = args.lastMessageReceived.presetNumber;
                    // preset number has changed, refresh the details
                    this.requestPresetConfig();
                }
            }

            this.onStateChangeHandler();
        });

        ipcRenderer.on('device-connection-changed', (event, args) => {

            this.log("got connection event from main:" + args);

            if (args == "connected") {
                this.isConnected = true;
            }

            if (args == "failed") {
                this.isConnected = false;
            }

            this.onStateChangeHandler();
        });

        ipcRenderer.on('devices-discovered', (event, args) => {

            this.log("got refreshed list of devices:" + args);

            this.devices = args;

            this.onStateChangeHandler();
        });
    }

    log(msg: string) {
        console.log(msg);
    }

    async scanForDevices(): Promise<boolean> {
        await ipcRenderer.invoke('perform-action', { action: 'scan' });
        return true;
    }

    getLastConnectedDevice(): BluetoothDeviceInfo {
        let deviceJson = localStorage.getItem("lastConnectedDevice");
        if (deviceJson) {
            return <BluetoothDeviceInfo>JSON.parse(deviceJson);
        } else {
            return null;
        }
    }

    async connectDevice(device: BluetoothDeviceInfo): Promise<boolean> {
        if (device == null) return;

        try {
            return await ipcRenderer.invoke('perform-action', { action: 'connect', data: device }).then(() => {

                // store last connected devices
                this.isConnected = true;

                localStorage.setItem("lastConnectedDevice", JSON.stringify(device));

                return true;
            });
        } catch (err) {
            return false;
        }

    }

    async requestPresetConfig(): Promise<boolean> {
        await ipcRenderer.invoke('perform-action', { action: 'getPreset', data: 0 }).then(
            () => {
                this.log("Completed preset query");
            });
        return true;
    }

    async requestPresetChange(args: Preset) {
        return ipcRenderer.invoke('perform-action', { action: 'applyPreset', data: args }).then(
            () => {

            });
        return true;
    }


    async requestAmpChange(args: FxChangeMessage) {
        return ipcRenderer.invoke('perform-action', { action: 'changeAmp', data: args }).then(
            () => {

            });
        return true;
    }

    async requestFxChange(args: FxChangeMessage) {
        return ipcRenderer.invoke('perform-action', { action: 'changeFx', data: args }).then(
            () => {

            });
        return true;
    }

    private async requestFxParamChangeImmediate(args) {
        return ipcRenderer.invoke('perform-action', { action: 'setFxParam', data: args }).then(
            () => {

            });
        return true;
    }

    async requestFxParamChange(args): Promise<boolean> {

        if (this.debouncedFXUpdate == null) {
            this.debouncedFXUpdate = debounce((args) => this.requestFxParamChangeImmediate(args), 250);
        }

        this.debouncedFXUpdate(args);

        return true;
    }

    async requestFxToggle(args): Promise<boolean> {
        await ipcRenderer.invoke('perform-action', { action: 'setFxToggle', data: args }).then(
            () => {
                this.log("Sent fx toggle change");
            });
        return true;
    }

    async setChannel(channelNum: number): Promise<boolean> {
        await ipcRenderer.invoke('perform-action', { action: 'setChannel', data: channelNum }).then(
            () => {
                this.log("Completed preset query");
            });
        return true;
    }

    async getDeviceName(): Promise<boolean> {
        await ipcRenderer.invoke('perform-action', { action: 'getDeviceName', data: {} }).then(
            () => {

            });
        return true;
    }

    async getDeviceSerial(): Promise<boolean> {
        await ipcRenderer.invoke('perform-action', { action: 'getDeviceSerial', data: {} }).then(
            () => {

            });
        return true;
    }
}

export default DeviceViewModel;