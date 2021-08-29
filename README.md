# Soundshed

Desktop UI which can be used to:
- manage tone library and browse tone communities, share tones
- connect to supported amp via bluetooth, manage basic settings and set presets.
- browse and favourite video backing tracks

Download from https://soundshed.com or check out the web app version.

Windows, macOS and Linux. Bluetooth connectivity required.

*Supported amps:*
- Positive Grid Spark 40: https://www.positivegrid.com/spark/

![](docs/screens/ui.png)


### Known Issues
- Device controls (summary level - hidden) not hooked up
- More keyword search/paging etc required
- Amp sometimes returns garbled info
- Invalid settings may crash amp, requiring amp to be switched off and on again.

## Roadmap

Possible future features include:

- More reliable amp communication
- UI refinements
- Code refactoring and tidy
- More tone community features
- Lessons (community supplied links to video lessons etc)
- artist and song metadata for correct cross reference of tones, backing tracks and lessons.

#### Event Mapping
Input event from keyboard or midi can be mapped to either a preset slot (e.g. channels 1-4) or 

#### Default FX
- default slot settings (fx type, parameter settings) can be applied, e.g a default Noise Gate configuration which can either be applied all the time or on demand.

## Build
![app build](https://github.com/soundshed/soundshed-app/workflows/app%20build/badge.svg)
- Prerequisites: Node JS 14.x or higher, npm 6.14 or higher. Windows, macOS or Linux

- Building the bluetooth-serial-port node module has various requirements depending on the platform you are developing for: https://github.com/tinyprinter/node-bluetooth-serial-port - we are using a custom fork with minor fixes.

- VS Code is the recommended editor

- If working on the Lessons portion, you will need to add your youtube-data-api key to the `/src/env.ts` file. More information available [here](https://developers.google.com/youtube/v3/getting-started). Please do not submit this file in pull requests.

- Clone this repository
- run `npm install` on the repo path

## Run Web Version
- edit platformUtils.ts to include platformUtils.web.ts, edit env.ts to be web mode
- Run `npm run watch-web` in one terminal to continuously rebuild the UI code or `npm run build-web` to just build once. Note that there is a build for the app UI and a build for the electron main process, some of which use the same files (types etc).
- Run `http-server build` to start local web server on http://localhost:8080/

## Run Electron Version
- edit platformUtils.ts to include platformUtils.electron.ts, edit env.ts not to be web mode
- Run `npm run watch-electron` in one terminal to continuously rebuild the UI code or `npm run build-electron` to just build once. Note that there is a build for the app UI and a build for the electron main process, some of which use the same files (types etc).
- Run `npm run start-electron` to launch the UI

The final installable app is packaged using electron-forge:
`npm run make`

## Toggle between web and electron mode
- edit env.ts, set IsWebMode true/false
- edit platformUtils.ts, import required platform

## Release Process 
- Electron
    - ensure electron config selected
    - ensure webpack.electron.config is set to production
    - Increment version in package.json, run installer Github Action, run Release Github Action, Edit release notes.
- Web
    - ensure web config selected
    - ensure webpack.web.config is set to production
    - Run build and deploy files
    
### Architecture
The app is built using TypeScript, with electron/node as a the host process, talking to the electron renderer and back again (the standard electron way of working).

The UI is React (TypeScript variant) with bootstrap for UI css. The Pullstate library is use for app state management and a couple of view model classes exist to centralise common points of interaction with APIs, the devices and state.

Communication with the device works by connection/handling serial bluetooth comms events in the main process (electron/node), this then sends an IPC message to the renderer which has listeners in the appViewModel, these then pass relevant data to the react UI. Actions in the UI invoke appViewModel methods which in turn fire IPC messages back to the main process in order to perform bluetooth actions.

Original template is loosely based on https://www.sitepen.com/blog/getting-started-with-electron-typescript-react-and-webpack

