import React from "react";

import { appViewModel } from "./app";
import Button from "react-bootstrap/Button";
import { AppStateStore } from "../stores/appstate";
import { openLink } from "../core/platformUtils";
import env from "../env";

const AboutControl = () => {
  React.useEffect(() => {
    appViewModel.refreshAppInfo();
    checkForUpdates();
  }, []);

  const appInfo = AppStateStore.useState((s) => s.appInfo);

  const appUpdateAvailable = AppStateStore.useState((s) => s.isUpdateAvailable);

  const isWebMode = env.IsWebMode;
  React.useEffect(() => {}, [appUpdateAvailable, appInfo]);

  const checkForUpdates = async (showInfo: boolean = false) => {
    let result = await appViewModel.checkForUpdates();
    if (showInfo) {
      if (result == null || result.isUpdateAvailable == false) {
        alert(
          "You are using the latest available app version. You should also regularly check soundshed.com for updates and news."
        );
      } else {
        alert("There is a new app version available.");
      }
    }
  };

  return (
    <div className="about-intro">
      <h1>About</h1>

      <p>
        <a
          href="#"
          onClick={(e) => {
            openLink(e, "https://soundshed.com");
          }}
        >
          soundshed.com
        </a>
      </p>
      <p>Browse and manage favourite tones, preview or store on your amp.</p>
      <p>
        Join the{" "}
        <a
          href="#"
          onClick={(e) => {
            openLink(
              e,
              "https://github.com/soundshed/soundshed-app/discussions"
            );
          }}
        >
          community discussions
        </a>
      </p>
      {isWebMode == false ? (
        <div>
          {appUpdateAvailable == true ? (
            <p className="alert alert-info m-2 p-2">
              There is a new app version available. Updating is recommended.
              <Button
                className="btn btn-sm ms-2"
                onClick={(e) => {
                  openLink(e, "https://soundshed.com");
                }}
              >
                Download Update
              </Button>
            </p>
          ) : (
            <p>
              <span className="badge rounded-pill bg-secondary">
                {appInfo?.name} {appInfo?.version}
              </span>
              <Button
                className="btn btn-sm ms-2"
                onClick={() => {
                  checkForUpdates(true);
                }}
              >
                Check For Updates
              </Button>
            </p>
          )}
        </div>
      ) : (
        <span className="badge rounded-pill bg-secondary">Web Version</span>
      )}
      <h3>Credits</h3>
      <p>
        Spark communications code based on
        https://github.com/paulhamsh/Spark-Parser
      </p>
      <p>
        Some preset information adapted from
        https://github.com/richtamblyn/PGSparkLite
      </p>
      <p>Burning Guitar Photo by Dark Rider on Unsplash</p>
      <p>Pedal Board + Red Shoe Photo by Jarrod Reed on Unsplash</p>
      <p>Wooden Pedal Board Photo by Luana Azevedo on Unsplash</p>
      <p>Soundshed app by Christopher Cook</p>
    </div>
  );
};

export default AboutControl;
