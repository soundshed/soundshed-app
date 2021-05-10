import * as React from "react";

import ReactPlayer from "react-player";
import { shell } from "electron";
import { lessonManager } from "./app";
import { VideoSearchResult } from "../core/videoSearchApi";
import { Form, Nav } from "react-bootstrap";
import { LessonStateStore } from "../stores/lessonstate";
import { UIFeatureToggleStore } from "../stores/uifeaturetoggles";

const LessonsControl = () => {
  const enableLessons = UIFeatureToggleStore.useState((s) => s.enableLessons);
  const videoSearchResults = LessonStateStore.useState((s) => s.searchResults);
  const favourites = LessonStateStore.useState((s) => s.favourites);

  const [view, setView] = React.useState("backingtracks");
  const [playVideoId, setPlayVideoId] = React.useState("");
  const [keyword, setKeyword] = React.useState("");

  const openLink = (e, linkUrl) => {
    e.preventDefault();
    shell.openExternal(linkUrl, {});
  };

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
      console.log("Lessons updating.");
    }
  }, []);

  React.useEffect(() => {}, [videoSearchResults]);

  const playVideo = (v: VideoSearchResult) => {
    setPlayVideoId(v.itemId);

    LessonStateStore.update(s=>{s.playingVideoUrl=v.url});
  };

  const onSearch = () => {
    lessonManager.getVideoSearchResults(false, "backing track " + keyword);
  };

  const onKeySearch = (event) => {
    if(event.key === 'Enter'){
      onSearch();
    }
  };

  const renderView = () => {
    switch (view) {
      case "backingtracks":
        return (
          <div className="m-2">
            <Form>
              <Form.Group controlId="formSearch">
                <Form.Label>Keyword</Form.Label>
                <Form.Control
                  type="text"
                  placeholder="Search by keyword"
                  value={keyword}
                  onChange={(event) => {
                    setKeyword(event.target.value);
                  }}
                  onKeyPress={onKeySearch}
                />
              </Form.Group>
            </Form>
            <button className="btn btn-sm btn-success" onClick={onSearch}>
              Search
            </button>

            {listVideoItems(videoSearchResults)}
          </div>
        );
      case "favourites":
        return <div className="m-2">{listVideoItems(favourites)}</div>;
    }
  };

  const listVideoItems = (results: VideoSearchResult[]) => {
    if (!results) {
      return <div>No Results</div>;
    } else {
      return results.map((v) => (
        <div
          className="video-search-result row"
          key={v.itemId}
          onClick={() => {
            playVideo(v);
          }}
        >
          <div className="col-md-10">
         
             
                <h5>{v.title}</h5>
                <img src={v.thumbnailUrl} className={playVideoId == v.itemId?"now-playing":""}></img>
                <span className={"badge rounded-pill bg-primary"}>
                  {v.channelTitle}
                </span>
             
           
          </div>
          <div className="col-md-2">
            {(() => {
              if (isFavourite(v) == true) {
                return (
                  <button
                    className="btn btn-sm btn-danger"
                    onClick={() => {
                      deleteFavourite(v);
                    }}
                  >
                    🗑
                  </button>
                );
              } else {
                return (
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={() => {
                      saveFavourite(v);
                    }}
                  >
                    {" "}
                    ⭐
                  </button>
                );
              }
            })()}
          </div>
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

          <Nav
            variant="tabs"
            activeKey={view}
            onSelect={(selectedKey) => setView(selectedKey)}
          >
            <Nav.Item>
              <Nav.Link eventKey="backingtracks">Backing Tracks</Nav.Link>
            </Nav.Item>

            <Nav.Item>
              <Nav.Link eventKey="favourites">Favourites</Nav.Link>
            </Nav.Item>
          </Nav>

          {renderView()}
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
