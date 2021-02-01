import * as React from "react";

import ReactPlayer from "react-player";
import { shell } from "electron";
import { UIFeatureToggleStore } from "../core/appViewModel";

const LessonsControl = () => {
  const enableLessons = UIFeatureToggleStore.useState((s) => s.enableLessons);

  const openLink = (e, linkUrl) => {
    e.preventDefault();
    shell.openExternal(linkUrl, {});
  };

  return (
    <div className="about-intro">
      <h1>Lessons</h1>

      {enableLessons==false ? (
        <div>
         
          <p>Browse lessons curated by the community.</p>
          <h3>Coming Soon</h3>
        </div>
      ) : (
        <div>
          <p> Browse lessons curated by the community.</p>
          <div className="lesson-summary">
            <h2>Steve Stine : Fretboard Mastery Lesson Series</h2>
            <p>
              This course walks through common challenges for fully learning the
              guitar.
            </p>
          </div>
          <ReactPlayer
            controls={true}
            url="https://www.youtube.com/watch?v=Piu3BF-bUHA&list=PLn8Cg_n-kuKCd6O9kDsTS2kLR2SvhFlHz"
          />
        </div>
      )}
    </div>
  );
};

export default LessonsControl;
