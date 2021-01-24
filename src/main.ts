//import { SparkManager } from './lib/spork/sparkManager';
import { app, BrowserWindow, ipcMain, ipcRenderer } from 'electron';
import { SparkDeviceManager } from './spork/src/devices/spark/sparkDeviceManager';
import installExtension, { REACT_DEVELOPER_TOOLS } from 'electron-devtools-installer';


try {
    require('electron-reloader')(module)
} catch (_) { }


let win: BrowserWindow;

const sendMessageToApp = (type: string, msg: string) => {
    if (win) {
        // send message to be handled by the UI/app (appViewModel)
        win.webContents.send(type, msg);
    }
}

function createWindow() {
    win = new BrowserWindow({
        width: 800,
        height: 600,

        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    })

    win.loadFile('index.html');
}

const deviceManager = new SparkDeviceManager();

deviceManager.onStateChanged = (s: any) => {
    console.log("main.ts: device state changed")
    sendMessageToApp('device-state-changed', s);
};

ipcMain.handle('perform-action', (event, args) => {
    // ... do actions on behalf of the Renderer
    console.log("got event from render:" + args.action);

    if (args.action == 'scan') {
        deviceManager.scanForDevices().then((devices) => {
            console.log(JSON.stringify(devices));

            sendMessageToApp('devices-discovered', devices);
        });
    }

    if (args.action == 'connect') {
        console.log("attempting to connect:: " + JSON.stringify(args));

        try {
            deviceManager.connect(args.data).then(connectedOk => {
                if (connectedOk) {
                    sendMessageToApp("device-connection-changed", "connected")

                    deviceManager.sendCommand("get_preset", 0);

                    //await deviceManager.sendPreset(preset1);
                } else {
                    sendMessageToApp("device-connection-changed", "failed")
                }

            }).catch(err => {
                sendMessageToApp("device-connection-changed", "failed")
            });
            
        } catch (e) {
            sendMessageToApp("device-connection-changed", "failed")
        }
    }

    if (args.action == 'applyPreset') {
      
        // send preset
       // deviceManager.sendCommand("set_preset", p);
        deviceManager.sendCommand("set_preset_from_model", args.data);

        setTimeout(() => {
            //apply preset to virtual channel 127
            deviceManager.sendCommand("set_channel", 127);
        }, 500);
       
    }

    if (args.action == 'getDeviceName') {
        deviceManager.sendCommand("get_device_name", {});
    }

    if (args.action == 'getDeviceSerial') {
        deviceManager.sendCommand("get_device_serial", {});
    }

    if (args.action == 'getPreset') {
        deviceManager.sendCommand("get_preset", args.data);
    }

    if (args.action == 'setChannel') {
        deviceManager.sendCommand("set_channel", args.data);
    }

    if (args.action == 'setFxParam') {
        deviceManager.sendCommand("set_fx_param", args.data);
    }

    if (args.action == 'setFxToggle') {
        deviceManager.sendCommand("set_fx_onoff", args.data);
    }

    if (args.action == 'changeFx') {
        deviceManager.sendCommand("change_fx", args.data);
    }

    if (args.action == 'changeAmp') {
        deviceManager.sendCommand("change_amp", args.data);
    }
})


////////////////////////

app.whenReady().then(() => {

    /*installExtension(REACT_DEVELOPER_TOOLS)
    .then((name) => console.log(`Added Extension:  ${name}`))
    .catch((err) => console.log('An error occurred: ', err));*/

    createWindow();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
    }
})


