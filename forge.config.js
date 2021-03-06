module.exports = {

    packagerConfig: { 
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
        "appleId": "",
        "appleIdPassword": "",
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