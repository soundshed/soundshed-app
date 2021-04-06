
import { app, BrowserWindow, ipcMain } from 'electron';
import { RfcommProvider } from './spork/src/devices/spark/rfcommProvider';
import { SparkDeviceManager } from './spork/src/devices/spark/sparkDeviceManager';

const deviceManager = new SparkDeviceManager(new RfcommProvider());
let win: BrowserWindow;

try {
    require('electron-reloader')(module)
} catch (_) { }



if (handleSquirrelEvent()) {
    // squirrel event handled and app will exit in 1000ms, so don't do anything else
    app.quit();
}
else {

    // perform update check and start app normally
  
    initApp();

    setTimeout(()=>{
        require('update-electron-app')();
    },10000);
}



function initApp(){

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
                return deviceManager.connect(args.data).then(connectedOk => {
                    if (connectedOk) {
                        sendMessageToApp("device-connection-changed", "connected")

                        deviceManager.sendCommand("get_preset", 0);

                        //await deviceManager.sendPreset(preset1);
                    } else {
                        sendMessageToApp("device-connection-changed", "failed")
                    }

                    return connectedOk;
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

        if (args.action == 'getCurrentChannel') {
            deviceManager.sendCommand("get_selected_channel", {});
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

            setTimeout(() => {
                //apply preset to virtual channel 127
              //  deviceManager.sendCommand("set_channel", 127);
            }, 1000);
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

}

const sendMessageToApp = (type: string, msg: any) => {
    if (win) {
        // send message to be handled by the UI/app (appViewModel)
        win.webContents.send(type, msg);
    }
}

function createWindow() {

    win = new BrowserWindow({
        width: 1280,
        height: 860,
        icon:"./images/icon/favicon.ico",
        webPreferences: {
            nodeIntegration: true,
            enableRemoteModule: true,
            contextIsolation: false
        }
    })

    // win.webContents.setUserAgent("Dalvik/2.1.0 (Linux; U; Android 11; Pixel 3 Build/RQ1A.210105.003)");
    
    if (app.isPackaged) {
        win.removeMenu();
    }

    win.loadFile('index.html');
}

// handle squirrel installer events
function handleSquirrelEvent() {
    if (process.argv.length === 1) {
        return false;
    }

    const ChildProcess = require('child_process');
    const path = require('path');

    const appFolder = path.resolve(process.execPath, '..');
    const rootAtomFolder = path.resolve(appFolder, '..');
    const updateDotExe = path.resolve(path.join(rootAtomFolder, 'Update.exe'));
    const exeName = path.basename(process.execPath);

    const spawn = function (command, args) {
        let spawnedProcess, error;

        try {
            spawnedProcess = ChildProcess.spawn(command, args, { detached: true });
        } catch (error) { }

        return spawnedProcess;
    };

    const spawnUpdate = function (args) {
        return spawn(updateDotExe, args);
    };

    const squirrelEvent = process.argv[1];
    switch (squirrelEvent) {
        case '--squirrel-install':
        case '--squirrel-updated':
            // Optionally do things such as:
            // - Add your .exe to the PATH
            // - Write to the registry for things like file associations and
            //   explorer context menus

            // Install desktop and start menu shortcuts
            spawnUpdate(['--createShortcut', exeName]);

            setTimeout(app.quit, 1000);
            return true;

        case '--squirrel-uninstall':
            // Undo anything you did in the --squirrel-install and
            // --squirrel-updated handlers

            // Remove desktop and start menu shortcuts
            spawnUpdate(['--removeShortcut', exeName]);

            setTimeout(app.quit, 1000);
            return true;

        case '--squirrel-obsolete':
            // This is called on the outgoing version of your app before
            // we update to the new version - it's the opposite of
            // --squirrel-updated

            app.quit();
            return true;
    }
};