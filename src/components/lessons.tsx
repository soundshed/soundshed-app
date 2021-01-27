import * as React from "react";

import ReactPlayer from 'react-player'
import { shell } from "electron";

const LessonsControl = () => {
  const openLink = (e, linkUrl) => {
    e.preventDefault();
    shell.openExternal(linkUrl, {});
  };

  return (
    <div className="about-intro">
      <h1>Lessons</h1>
      <p> [Coming Soon] Browse lessons curated by the community:</p>
      <div className="lesson-summary">
        <h2>Steve Stine : Fretboard Mastery Lesson Series</h2>
        <p>This course walks through common challenges for fully learning the guitar.</p>
      </div>
      <ReactPlayer controls={true} url="https://www.youtube.com/watch?v=Piu3BF-bUHA&list=PLn8Cg_n-kuKCd6O9kDsTS2kLR2SvhFlHz" />
    </div>
  );
};

export default LessonsControl;
