module.exports = {

    packagerConfig: {},
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