import React, { useEffect } from "react";

import ReactPlayer from "react-player/youtube";
import { lessonManager } from "./app";
import { VideoSearchResult } from "../core/videoSearchApi";
import { LessonStateStore } from "../stores/lessonstate";
import { UIFeatureToggleStore } from "../stores/uifeaturetoggles";

const LessonsControl = () => {
  const enableLessons = UIFeatureToggleStore.useState((s) => s.enableLessons);
  const videoSearchResults = LessonStateStore.useState((s) => s.searchResults);
  const favourites = LessonStateStore.useState((s) => s.favourites);

  const [view, setView] = React.useState("backingtracks");
  const [playVideoId, setPlayVideoId] = React.useState("");
  const [keyword, setKeyword] = React.useState("");

  const isFavourite = (v: VideoSearchResult): boolean => {
    if (favourites.find((f: VideoSearchResult) => f.itemId == v.itemId)) {
      return true;
    } else {
      return false;
    }
  };

  const saveFavourite = (t: VideoSearchResult) => {
    lessonManager.storeFavourite(t);
  };

  const deleteFavourite = (t: VideoSearchResult) => {
    lessonManager.deleteFavourite(t);
  };

  React.useEffect(() => {
    if (videoSearchResults == null || videoSearchResults.length == 0) {
      lessonManager.getVideoSearchResults(true, "backing track");
      console.debug("Lessons updating.");
    }
  }, []);

  React.useEffect(() => {}, [videoSearchResults]);

  const playVideo = (v: VideoSearchResult) => {
    setPlayVideoId(v.itemId);

    LessonStateStore.update((s) => {
      s.playingVideoUrl = v.url;
    });
  };

  const onSearch = () => {
    lessonManager.getVideoSearchResults(false, "backing track " + keyword);
  };

  const onKeySearch = (event) => {
    if (event.key === "Enter") {
      onSearch();
    }
  };

  const renderView = () => {
    switch (view) {
      case "backingtracks":
        return (
          <div className="jam-search-section">
            <div className="jam-search-bar">
              <input
                type="text"
                className="jam-search-input"
                placeholder="Search backing tracks…"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                onKeyPress={onKeySearch}
              />
              <button className="jam-search-btn" onClick={onSearch}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                Search
              </button>
            </div>
            {listVideoItems(videoSearchResults)}
          </div>
        );
      case "favourites":
        return <div>{listVideoItems(favourites)}</div>;
    }
  };

  const listVideoItems = (results: VideoSearchResult[]) => {
    if (!results || results.length === 0) {
      return <div className="jam-empty">No results yet. Search for a backing track above.</div>;
    }
    return (
      <div className="jam-grid">
        {results.map((v) => (
          <div
            key={v.itemId}
            className={`jam-card${playVideoId === v.itemId ? " jam-card--playing" : ""}`}
            onClick={() => playVideo(v)}
          >
            <div className="jam-thumb-wrap">
              <img src={v.thumbnailUrl} className="jam-thumb" alt="" />
              <div className="jam-thumb-overlay">
                <span className="jam-play-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
                </span>
              </div>
              {playVideoId === v.itemId && (
                <span className="jam-now-playing-badge">▶ Playing</span>
              )}
            </div>
            <div className="jam-card-body">
              <span className="jam-title">{v.title}</span>
              <span className="jam-channel">{v.channelTitle}</span>
            </div>
            <button
              className={`jam-fav-btn${isFavourite(v) ? " jam-fav-btn--active" : ""}`}
              title={isFavourite(v) ? "Remove favourite" : "Save favourite"}
              onClick={(e) => { e.stopPropagation(); isFavourite(v) ? deleteFavourite(v) : saveFavourite(v); }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill={isFavourite(v) ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
              </svg>
            </button>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="lessons-intro">
      <div className="jam-header">
        <h1 className="jam-heading">Jam</h1>
        <p className="jam-sub">Search backing tracks and video lessons to play along with.</p>
      </div>

      {enableLessons == false ? (
        <div>
          <div className="ss-tabs">
            <button className={`ss-tab${view === "backingtracks" ? " active" : ""}`} onClick={() => setView("backingtracks")}>Backing Tracks</button>
            <button className={`ss-tab${view === "favourites" ? " active" : ""}`} onClick={() => setView("favourites")}>Favourites</button>
          </div>
          <div className="jam-tab-body">
            {renderView()}
          </div>
        </div>
      ) : (
        <div>
          <p>Browse lessons curated by the community.</p>
          <div className="lesson-summary glass-panel">
            <h2>Steve Stine — Fretboard Mastery Lesson Series</h2>
            <p>This course walks through common challenges for fully learning the guitar.</p>
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
