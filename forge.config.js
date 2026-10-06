const signRelease = process.env.SOUNDSHED_SIGN_RELEASE === "true";

if (signRelease) {
    const required = process.platform === "darwin"
      ? ["MACOS_APPLEID", "MACOS_APP_SPECIFIC_PASSWORD"]
      : process.platform === "win32"
        ? ["WIN_CODE_SIGNING_P12", "WIN_CODE_SIGNING_PWD"]
        : [];
    for (const name of required) {
        if (!process.env[name]) {
            throw new Error(`Missing release signing environment variable: ${name}`);
        }
    }
}

module.exports = {

    packagerConfig: { 
      name:"Soundshed",
      appBundleId:"com.soundshed.tones",
      icon: "images/icon/favicon.ico",
      usageDescription: {
        Microphone:
          'Microphone access may be required for some functionality such as tuner or guitar jam.',
      },
      appCategoryType: 'public.app-category.utilities',
      ignore:[
        ".vscode",
        "forge.config.js",
        "secret.p12",
        "^/app-private($|/)",
        "^/build-tools($|/)"
      ],
      osxSign: signRelease && process.platform === "darwin" ? {
        "identity": "Developer ID Application: Webprofusion Pty Ltd (2L7LP952XY)",
        optionsForFile: () => ({
          entitlements: "entitlements.plist",
          hardenedRuntime: true
        })
      } : undefined,
      osxNotarize: signRelease && process.platform === "darwin" ? {
        "appleId": process.env.MACOS_APPLEID,
        "appleIdPassword": process.env.MACOS_APP_SPECIFIC_PASSWORD,
        "teamId": "2L7LP952XY"
      } : undefined
    },
    makers: [
      {
        name: "@electron-forge/maker-squirrel",
        config: {
          name: "soundshed",
          certificateFile: signRelease ? process.env.WIN_CODE_SIGNING_P12 : undefined,
          certificatePassword: signRelease ? process.env.WIN_CODE_SIGNING_PWD : undefined,
          loadingGif: "images/icon/loading-screen.gif",
          iconUrl:"https://soundshed.com/favicon.ico",
          setupIcon:"images/icon/favicon.ico"
        }
      },
      {
        name: "@electron-forge/maker-zip",
        platforms: [
          "darwin","linux"
        ]
      }

    ]
 
}
