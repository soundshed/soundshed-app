
import { app, BrowserWindow, ipcMain } from 'electron';

let win: BrowserWindow;
let callbackForDeviceSelection = null;

const sendMessageToApp = (type: string, msg: any) => {
    if (win) {
        // send message to be handled by the UI/app (appViewModel)
        win.webContents.send(type, msg);
    } else {
        logInfo("Cannot send message to app, win not defined");
    }
}


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
function logInfo(msg) {
    console.log("[Electron MAIN]: " + msg);
}

function initApp() {

    ipcMain.handle('perform-action', (event, args) => {
        logInfo("In electron perform-action.. will do nothing:" + JSON.stringify(args));

        // ... do hardware actions on behalf of the Renderer
        //deviceContext.performAction(args);
    });

    ipcMain.on('perform-device-selection', (event, args) => {
        // complete device selection process
        logInfo("Completing device selection " + JSON.stringify(args));
        if (callbackForDeviceSelection) {
           // callbackForDeviceSelection(args);
        } else {
            logInfo("No callback for device selection. Cannot complete");
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
            webSecurity: false,
            experimentalFeatures: true
        }
    })

    if (app.isPackaged) {
        win.removeMenu();
    }

    // setup permission handlers

    let devicesDiscoveredCount = 0;
    // bluetooth device selection, fires multiple times as the process performs a scan, then the UI must present a device picker using deviceList, then the callback is used to resolve device selection
    win.webContents.on('select-bluetooth-device', (event, deviceList, callback) => {
        event.preventDefault();

        callbackForDeviceSelection = callback;

        if (devicesDiscoveredCount != deviceList?.length) {

            if (deviceList && deviceList.length > 0) {

                devicesDiscoveredCount = deviceList.length;

                var mappedDevices = deviceList
                    .filter(x => x.deviceName.indexOf("Spark") > -1)
                    .map(x => { return { name: x.deviceName, address: x.deviceId, port: null } });

                logInfo(`Found ${mappedDevices.length} matching bluetooth devices out of ${deviceList.length}, send to UI for selection.`);
                // send current device list to UI
                sendMessageToApp("devices-discovered", mappedDevices);

                var matched = deviceList.find(x => x.deviceName.indexOf("Spark") > -1);
                if (matched) {
                    logInfo("Auto selected device "+matched.deviceId);
                    callback(matched.deviceId);
                }
            } else {
                logInfo("No bluetooth devices found");
            }

        }
    })

    const ses = win.webContents.session;

    ses.setPermissionRequestHandler((webContents, permission, callback) => {
        logInfo("Requested permission: " + permission);
        callback(true);
    });

    ses.setPermissionCheckHandler((webContents, permission, requestingOrigin) => {

        logInfo("Checked permission: " + permission);
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
