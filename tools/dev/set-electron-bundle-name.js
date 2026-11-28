// In development macOS takes the menu bar title (and the name shown in the Dock and
// Cmd-Tab) from the stock Electron.app bundle in node_modules, which says "Electron".
// The packaged app gets "Soundshed" from forge.config.js; this renames the dev bundle
// to match. It runs before every `npm run start-electron`, so a reinstall is fine.
const { execFileSync } = require('child_process');
const path = require('path');

const APP_NAME = 'Soundshed';

if (process.platform === 'darwin') {
    // requiring electron returns the binary path (and downloads Electron if needed)
    const electronBinary = require('electron');
    const plist = path.join(path.dirname(electronBinary), '..', 'Info.plist');

    for (const key of ['CFBundleName', 'CFBundleDisplayName']) {
        const current = execFileSync('plutil', ['-extract', key, 'raw', plist]).toString().trim();
        if (current !== APP_NAME) {
            execFileSync('plutil', ['-replace', key, '-string', APP_NAME, plist]);
            console.log(`Set ${key} of the development Electron.app to ${APP_NAME}`);
        }
    }
}
