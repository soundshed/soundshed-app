{
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs =
    { nixpkgs, ... }:
    {
      packages = nixpkgs.lib.genAttrs [ "x86_64-linux" "aarch64-darwin" ] (
        system: with nixpkgs.legacyPackages.${system}; {
          default = buildNpmPackage {
            name = "soundshed";
            src = ./.;
            npmDeps = importNpmLock { npmRoot = ./.; };
            npmConfigHook = importNpmLock.npmConfigHook;
            # install scripts only serve the simulator and packaging tools
            npmRebuildFlags = [ "--ignore-scripts" ];
            npmBuildScript = "build-electron";

            # ponytail: updater removed, it is inert under Nix and this frees node_modules; a silent miss would build, then die at launch
            postPatch = ''
              cp src/core/platformUtils.electron.ts src/core/platformUtils.ts
              substituteInPlace src/env.ts --replace-fail 'IsWebMode: true' 'IsWebMode: false'
              substituteInPlace src/main.ts --replace-fail 'updateElectronApp();' ""
            '';

            installPhase =
              if stdenv.hostPlatform.isDarwin then
                ''
                  c=$out/Applications/Soundshed.app/Contents
                  mkdir -p $out/Applications
                  cp -r ${electron_44-bin.dist}/Electron.app $out/Applications/Soundshed.app
                  chmod -R u+w $c
                  sed -i '/CFBundle.*Name</{n;s/Electron/Soundshed/}; s/com.github.Electron/com.soundshed.tones/' $c/Info.plist
                  mkdir $c/Resources/app
                  cp -r build package.json $c/Resources/app
                ''
              else
                ''
                  mkdir -p $out/share/soundshed $out/share/applications
                  cp -r build package.json $out/share/soundshed
                  makeWrapper ${lib.getExe electron_44-bin} $out/bin/soundshed --add-flags $out/share/soundshed
                  install -Dm644 images/icon/icon.png $out/share/icons/hicolor/256x256/apps/soundshed.png
                  printf '[Desktop Entry]\nType=Application\nName=Soundshed\nExec=soundshed\nIcon=soundshed\nCategories=AudioVideo;Audio;\n' > $out/share/applications/soundshed.desktop
                '';
          };
        }
      );
    };
}
