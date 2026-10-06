# Soundshed Control

Desktop and Web UI which can be used to:
- manage tone library and browse tone communities
- connect to supported amp via bluetooth, manage basic settings and set presets.
- browse and favourite video backing tracks

See https://soundshed.com for info.

Windows 10 or later, macOS 13 (Ventura) or later, and supported Linux distributions.
64-bit OS and Bluetooth (BLE) connectivity required.

*Supported amps:*
- Positive Grid Spark 40, Spark Mini (Spark 2, Spark GO are experimentally supported): https://www.positivegrid.com/spark/

![](https://github.com/soundshed/soundshed-app/raw/main/docs/screens/ui.png)


### Known Issues
- Invalid settings may crash amp, requiring amp to be switched off and on again.

## Roadmap

Possible future features include:

- More reliable amp communication
- UI refinements
- More tone community features
- Lessons (community supplied links to video lessons etc)
- artist and song metadata for correct cross reference of tones, backing tracks and lessons.
- Support for an extensible range of amp and FX units
    - Abstraction to map device fx settings to a "soundshed" generic list of common FX.
    - For new devices implement read/write of presets/fx settings from the device and mappings to generic fx
    - Allow presets made for any device to be approximately mapped to any other support device.
    - Provide preset cloud for devices which don't natively have one.
    - Possibly extend presets to include impulse response (IR) waveforms for devices that support them.
    - Example Target devices: Line 6 Pod Go, Boss Katana MK II

#### Event Mapping
Input event from keyboard or midi can be mapped to a preset slot (e.g. channels 1-4). The app can currently learn some midi control inputs (note-on and program-change) and assign them to amp channel selections.

#### Default FX
- default slot settings (fx type, parameter settings) can be applied, e.g a default Noise Gate configuration which can either be applied all the time or on demand.

----------------------------------------

## Developer Build Info
![app build](https://github.com/soundshed/soundshed-app/workflows/app%20build/badge.svg)
- Prerequisites: Node 24 LTS (24.13 or later in the 24.x line), npm 11.19 or higher. `.nvmrc` selects Node 24.
- Linux native BLE builds require `build-essential` and `libbluetooth-dev`.

- VS Code is the recommended editor

- If working on the Lessons portion, you will need to add your youtube-data-api key to the `/src/env.ts` file. More information available [here](https://developers.google.com/youtube/v3/getting-started). Please do not submit this file in pull requests.

- Clone this repository
- run `npm ci` on the repo path. Commit `package-lock.json` alongside dependency changes so local and CI builds use the same versions.
- Dependency install scripts are explicitly approved in `package.json` under `allowScripts`; `.npmrc` fails installations with unreviewed scripts instead of silently skipping them. Review new scripts before approving them with `npm install-scripts approve <package>`.
- Run `npm run typecheck` to check the app and simulator tools, and `npm test` for the headless TCP integration test.
- TypeScript emits JavaScript into `build/`; webpack bundles the emitted renderer entry. `build-tools/` holds simulator output. Both directories are ignored.
- React remains on 18 because stable Pullstate does not support React 19. Dependabot intentionally excludes major React/type upgrades until the state layer can be migrated.

## Run Web Version
- edit platformUtils.ts to include platformUtils.web.ts, edit env.ts to be web mode
- Run `npm run watch-web` in one terminal to continuously rebuild the UI code or `npm run build-web` to just build once. Note that there is a build for the app UI and a build for the electron main process, some of which use the same files (types etc).
- Run `npx http-server build` to start local web server on http://localhost:8080/
- Example with SSL enabled: `npx http-server build --ssl -K C:/Work/Misc/ssl/localhost-key.pem -C C:/Work/Misc/ssl/localhost.pem`

## Run Electron Version
- edit platformUtils.ts to include platformUtils.electron.ts, edit env.ts not to be web mode
- Run `npm run watch-electron` in one terminal to continuously rebuild the UI code or `npm run build-electron` to just build once. Note that there is a build for the app UI and a build for the electron main process, some of which use the same files (types etc).
- Run `npm run start-electron` to launch the UI

The final installable app is packaged using electron-forge:
`npm run make`

Local installers are unsigned by default. Set `SOUNDSHED_SIGN_RELEASE=true` to enable signing; required signing credentials must be provided in the environment.

## Toggle between web and electron mode
- edit env.ts, set IsWebMode true/false
- edit platformUtils.ts, import required platform

## Use TCP Spark Simulator In App
1. Ensure Electron mode is selected:
    - set `IsWebMode` to `false` in `src/env.ts`
    - select the Electron import in `src/core/platformUtils.ts`
2. Build simulator tools once: `npm run build-tools`
3. Start simulator TCP mode from repo root:
    `npm run sim:spark -- --model spark-2 --transport tcp --host 127.0.0.1 --port 9124 --verbose`
4. In [src/env.ts](src/env.ts), set:
    - `SparkTransport: "tcp-sim"`
    - `SparkSimulatorHost: "127.0.0.1"`
    - `SparkSimulatorPort: 9124`
    - `SparkSimulatorModel: "spark-2"`
5. Start the app and run device scan/connect as normal. The app will show a virtual TCP simulator device instead of opening the BLE chooser.
6. To switch back to real hardware BLE, set `SparkTransport: "ble"`.

### Headless TCP Comms Test
- Run `npm run sim:spark:test` to start a temporary TCP simulator and exercise spork comms encode/decode flows without launching the app UI.
- Use `npm run sim:spark:test:quick -- --port 9124` for faster reruns after app TS is already built.

## Release Process 
- Electron
    - ensure electron config selected
    - ensure webpack.electron.config is set to production
    - Update the version in `package.json`, its lockfile, and `src/env.ts`.
    - Push a version tag such as `v1.3.1`. The `app build` workflow requires the tag, package version and app version to match, and builds web and x64 Windows/Linux/macOS installers; Windows and macOS tagged builds are signed.
    - After the tagged build succeeds, run `Publish Draft for Tag` with the existing tag and that build's run ID. The workflow verifies the tag/commit, successful build provenance, and all three artifacts before creating or updating a draft.
    - Review release notes and publish the draft manually. The workflow refuses to change an already-published release.
- Web
    - ensure web config selected
    - ensure webpack.web.config is set to production
    - Run build and deploy files

### GitHub Actions configuration
Pull requests, main-branch pushes, and manual builds produce unsigned installers without needing private signing credentials. Builds use Node 24, `npm ci`, read-only repository permissions, pinned action revisions, and fail if expected installer artifacts are missing. Dependabot checks npm packages and GitHub Actions weekly.

Tagged releases require these repository secrets:
- `PAT_TOKEN`: read access to `soundshed/soundshed-private`, containing `signing.pfx`, for Windows signing.
- `WIN_CODE_SIGN_PWD`: Windows certificate password.
- `MACOS_CERTIFICATE`: base64-encoded Developer ID Application certificate.
- `MACOS_APP_SIGNING_PWD`: password for the macOS certificate.
- `MACOS_APPLEID`: Apple ID used for notarization.
- `MACOS_APP_SPECIFIC_PASSWORD`: Apple app-specific password for notarization, separate from the certificate password.

The signing identity/team in `forge.config.js` is Webprofusion (`2L7LP952XY`). Temporary macOS keychains and certificate files are removed after packaging. Draft publishing uses the workflow's `GITHUB_TOKEN`; no release PAT is required. Artifact retention is 14 days, so publish the draft within that window or rebuild the tag.

### Architecture
The app is built using TypeScript. For the electron version, electron/node is the host process, talking to the electron renderer and back again (the standard electron way of working). Both web and electron versions now use Web Bluetooth (BLE).

The UI is React (TypeScript variant) with bootstrap for UI css. The Pullstate library is use for app state management and a couple of view model classes exist to centralise common points of interaction with APIs, the devices and state.

Original template is loosely based on https://www.sitepen.com/blog/getting-started-with-electron-typescript-react-and-webpack

#### Hardware communication

See our [Spark Amp Protocol document](docs/spark-amp-protocol.md) for current understanding of the spark amp communication.

[BLE Reader Data Received Queue]

[Spark Reader Message Queue]

[App Message Reader Loop]

At the bluetooth level the app registers a listener to consume data changes for a hardware characteristic, this delivers a stream of bytes in chunks. The app continuously queues the data recieved and looks for message terminator bytes (F7). When encountered it queues the current data for message processing higher up the chain.

The app then continuously runs a message processing loop to peek for terminated data chunks from the bluetooth reader, these are picked up from the bluetooth reader queue and parsed/interpreted into messages for our app, then added to our app message queue for later processing.
