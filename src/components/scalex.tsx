import React, { useEffect } from "react";

const ScalexControl = () => {

  React.useEffect(() => {
    
  }, []);


  return (
    <div className="lessons-intro toolkit-page">
      <h1>Guitar Toolkit</h1>
      <p>Learn scales for any fretted instrument (guitar, bass, ukulele etc) in a range of tunings via https://scalex.soundshed.com.</p>
      <iframe src="https://scalex.soundshed.com" className="iframe-container" width="100%"></iframe>
   </div>
  );
};

export default ScalexControl;
