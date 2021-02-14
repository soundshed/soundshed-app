import * as React from "react";

import ReactPlayer from "react-player";
import { shell } from "electron";
import { LessonStateStore, UIFeatureToggleStore } from "../core/appViewModel";
import { appViewModel } from "./app";
import { VideoSearchResult } from "../core/videoSearchApi";

const LessonsControl = () => {
  const enableLessons = UIFeatureToggleStore.useState((s) => s.enableLessons);
  const videoSearchResults = LessonStateStore.useState((s) => s.searchResults);

  
  const [view,setView]=React.useState("backingtracks");
  const [playVideoId,setPlayVideoId]=React.useState("");

  const openLink = (e, linkUrl) => {
    e.preventDefault();
    shell.openExternal(linkUrl, {});
  };

  React.useEffect(() => {
    if (videoSearchResults == null || videoSearchResults.length==0) {
      appViewModel.getVideoSearchResults(true, "backing track");
      console.log("Lessons updating.");
    }
  }, []);

  React.useEffect(()=>{},[videoSearchResults]);

  const playVideo = (v:VideoSearchResult) =>{
    setPlayVideoId(v.itemId);
  }

  const listVideoItems = (results:VideoSearchResult[]) => {
    if (!results) {
      return <div>No Results</div>;
    } else {
      return results.map((v) => (
          <div className="video-search-result" key={v.itemId} onClick={()=>{playVideo(v)}}> 
         

          {playVideoId==v.itemId?(

          <ReactPlayer
            controls={true}
            url={v.url}
          />

          ):( 
            <div>
          <h5>{v.title}</h5> 
          <img src={v.thumbnailUrl}></img>
            <span className={"badge rounded-pill bg-primary"}>{v.channelTitle}</span>
            </div>
          )}

          </div>
      ));
    }
  };

  return (
    <div className="about-intro">
      <h1>Jam</h1>

      {enableLessons == false ? (
        <div>
          <p>Lessons and Jam Tracks.</p>
       
          {listVideoItems(videoSearchResults)}
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
