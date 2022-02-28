import React, { useEffect } from "react";

const ScalexControl = () => {

  React.useEffect(() => {
    
  }, []);


  return (
    <div className="lessons-intro">
      <h1>Guitar Toolkit</h1>
      <p>Learn scales and chords for any fretted instrument (guitar, bass, ukulele etc) in a range of tunings.</p>
      <iframe src="https://scalex.soundshed.com" className="iframe-container" height="100%" width="100%"></iframe>
   </div>
  );
};

export default ScalexControl;
