# Soundshed

Desktop UI to connect to amp via bluetooth, manage basic settings and set presets.

Suported amps:
- Positive Grid Spark 40

![](docs/screens/ui.png)

## Build

- Prerequisites: Node JS 14.x or higher, npm 6.14 or higher. Cloned and building bluetooth-serial-port module which you will later link to. Bluetooth node module may have other requirements.
- VS Code is the recommended editor

- Clone this repository
- run `npm install` on the repo path
- npm link to the clone of the bluetooth module code (required after every npm install) `npm link bluetooth-serial-port` - Uses the https://github.com/tinyprinter/node-bluetooth-serial-port variant of npm module with some minor fixes to get Scan (inquire) to work.

## Run
- Run `npm run watch` in one terminal to continuously rebuild the UI code
- Run `npm run start` to launch the UI


The final installable app is packaged using electron-forge:
`npm run make`

### Architecture
The app is built using TypeScript, with electron/node as a the host process, talking to the electron renderer and back again (the standard electron way of working). 

The UI is React (TypeScript variant) with bootstrap for UI css. The Pullstate library is use for app state management and a couple of view model classes exist to centralise common points of interaction with APIs, the devices and state.

Communication with the device works by connection/handling serial bluetooth comms events in the main process (electron/node), this then sends an IPC message to the renderer which has listeners in the appViewModel, these then pass relevant data to the react UI. Actions in the UI invoke appViewModel methods which in turn fire IPC messages back to the main process in order to perform bluetooth actions.

Original template is loosely based on https://www.sitepen.com/blog/getting-started-with-electron-typescript-react-and-webpack

### Roadmap

- More reliable amp communication
- UI refinements
- Code refactoring and tidy
- More tone community features
- Lessons (community supplied links to video lessons etc)
- Backing tracks (simple index of youtube or soundcloud backing tracks tagged by genre, key, likes etc)