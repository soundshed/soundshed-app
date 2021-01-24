# Tone Manager UI

UI to connect to amp via bluetooth, manage basic settings and set presets.

![](docs/screens/ui.png)

## Build

rebuild npm packages for electron version of node: `.\node_modules\.bin\electron-rebuild.cmd`

force rebuild with `.\node_modules\.bin\electron-rebuild.cmd -w bluetooth-serial-port -f`
re-link custom version of bluetooth serial port: `npm link bluetooth-serial-port`
Use https://github.com/tinyprinter/node-bluetooth-serial-port variant of npm module.


template is loosely based on https://www.sitepen.com/blog/getting-started-with-electron-typescript-react-and-webpack


### Architecture
The app is built using TypeScript, with electron/node as a the host process, talking to the electron renderer and back again. The UI is React (TypeScript variant).

Communication with the device works by connection/handling serial bluetooth comms events in the main process (electron/node), this then sends an IPC message to the renderer which has listeners in the appViewModel, these then pass relevant data to the react UI. Actions in the UI invoke appViewModel methods which in turn fire IPC messages back to the main process in order to perform bluetooth actions.