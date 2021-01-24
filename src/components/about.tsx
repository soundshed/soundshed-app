import * as React from "react";
import { useEffect } from "react";

import { shell } from "electron";

const AboutControl = () => {
  const openLink = (e, linkUrl) => {
    e.preventDefault();
    shell.openExternal(linkUrl, {});
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

      <h3>Credits</h3>
      <p>
        Spark communications code based on
        https://github.com/paulhamsh/Spark-Parser
      </p>
      <p>Burning Guitar Photo by Dark Rider on Unsplash</p>
      <p>Soundshed app by Christopher Cook</p>
    </div>
  );
};

export default AboutControl;
