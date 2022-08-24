
import { app, BrowserWindow, ipcMain } from 'electron';
import { DeviceContext } from './core/deviceContext';
import { BleProvider } from './spork/src/devices/spark/bleProvider';

let win: BrowserWindow;
let callbackForDeviceSelection = null;

app.commandLine.appendSwitch('enable-web-bluetooth')

const sendMessageToApp = (type: string, msg: any) => {
    if (win) {
        // send message to be handled by the UI/app (appViewModel)
        win.webContents.send(type, msg);
    } else {
        console.log("Cannot send message to app, win not defined");
    }
}

const deviceContext: DeviceContext = new DeviceContext();
deviceContext.init(new BleProvider(), sendMessageToApp);
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

    setTimeout(() => {
        require('update-electron-app')();
    }, 10000);
}

///////////////////////////////////////////////////////////////

function initApp() {


    ipcMain.handle('perform-action', (event, args) => {
        console.log("In electron perform-action..");

        // ... do hardware actions on behalf of the Renderer
        deviceContext.performAction(args);
    });

    ipcMain.on('perform-device-selection', (event, args) => {
        // complete device selection process
        console.log("Completing device selection "+callbackForDeviceSelection );
        if (callbackForDeviceSelection) {
            callbackForDeviceSelection(args);
        }
    });

    app.whenReady().then(() => {
        createWindow();
    });

    app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') {
            app.quit();
        }
    });

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
}

function createWindow() {

    win = new BrowserWindow({
        width: 1280,
        height: 860,
        icon: "./images/icon/favicon.ico",
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            webSecurity: false
        }
    })

    if (app.isPackaged) {
        win.removeMenu();
    }

    // setup permission handlers


    // bluetooth device selection, fires multiple times as the process performs a scan, then the UI must present a device picker using deviceList, then the callback is used to resolve device selection
    win.webContents.on('select-bluetooth-device', (event, deviceList, callback) => {
        event.preventDefault();

        callbackForDeviceSelection = callback;

        var mappedDevices = deviceList.map(x => { return { name: x.deviceName, address: x.deviceId, port: null } });
        console.log(`Found ${mappedDevices.length} bluetooth devices, send to UI for selection.`);
        // send current device list to UI
        sendMessageToApp("devices-discovered", mappedDevices);

    })

    const ses = win.webContents.session;

    ses.setPermissionRequestHandler((webContents, permission, callback) => {
        console.log("Requested permission: " + permission);
        callback(true);
    });

    ses.setPermissionCheckHandler((webContents, permission, requestingOrigin) => {

        console.log("Checked permission: " + permission);
        return true;

    });

    
    win.loadFile('./build/index.html'); //    win.loadFile('./build/index.html');
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
}
