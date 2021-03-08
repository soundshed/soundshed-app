module.exports = {

    packagerConfig: { 
      name:"Soundshed",
      appBundleId:"com.soundshed.tones",
      usageDescription: {
        Microphone:
          'Microphone access may be required for some functionality such as tuner or guitar jam.',
      },
      appCategoryType: 'public.app-category.utilities',
      ignore:[
        ".vscode",
        "forge.config.js",
        "secret.p12"
      ],
      "osxSign": {
        "identity": "Developer ID Application: Webprofusion Pty Ltd (2L7LP952XY)",
        "hardened-runtime": true,
        "entitlements": "entitlements.plist",
        "entitlements-inherit": "entitlements.plist",
        "signature-flags": "library"
      },
      "osxNotarize": {
        "appBundleId":"com.soundshed.tones",
        "appleId": process.env.MACOS_APPLEID,
        "appleIdPassword": process.env.MACOS_APP_SIGNING_PWD,
      }
    },
    makers: [
      {
        name: "@electron-forge/maker-squirrel",
        config: {
          name: "soundshed",
          certificateFile: process.env.WIN_CODE_SIGNING_P12,
          certificatePassword: process.env.WIN_CODE_SIGNING_PWD
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