import * as React from "react";

import { shell } from "electron";

import { AppStateStore } from "../core/appViewModel";
import { appViewModel } from "./app";
import { Button } from "react-bootstrap";

const AboutControl = () => {
  React.useEffect(() => {
    appViewModel.refreshAppInfo();
  }, []);

  const appInfo = AppStateStore.useState((s) => s.appInfo);

  const openLink = (e, linkUrl) => {
    e.preventDefault();
    shell.openExternal(linkUrl, {});
  };

  const checkForUpdates = () => {
    appViewModel.checkForUpdates();
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
      <p>
        {" "}
        <span className="badge rounded-pill bg-secondary">
          {appInfo?.name} {appInfo?.version}
        </span>{" "}
        <Button className="btn btn-sm ms-2" onClick={checkForUpdates}>
          Check For Updates
        </Button>
      </p>
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
