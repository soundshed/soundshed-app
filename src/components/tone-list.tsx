import React, { useEffect } from "react";
import { Tone } from "../core/soundshedApi";
import { appViewModel } from "./app";

const ToneListControl = ({
  toneList,
  favourites,
  onApplyTone,
  onEditTone,
  noneMsg,
  enableToneEditor,
}) => {
  let noResultsMessage = noneMsg ?? "No results";

  useEffect(() => {}, [toneList, favourites]);

  const isFavouriteTone = (t: Tone): boolean => {
    if (
      favourites.find(
        (f) =>
          f.toneId == t.toneId ||
          (t.toneId != null && f.externalId == t.externalId)
      )
    ) {
      return true;
    } else {
      return false;
    }
  };

  const saveFavourite = (t: Tone) => {
    appViewModel.storeFavourite(t, false);
  };

  const deleteFavourite = (t: Tone) => {
    appViewModel.deleteFavourite(t);
  };

  const mapDeviceType = (t) => {
    if (t == "pg.spark40") {
      return "Spark 40";
    } else {
      return "Unknown Device Type";
    }
  };

  const formatCategoryTags = (
    items: string[],
    variant: string = "secondary"
  ) => {
    return items.map((i, idx) => (
      <span key={idx} className={`tone-tag tone-tag--${variant}`}>
        {i}
      </span>
    ));
  };

  const renderToneList = () => {
    return toneList.map((tone: Tone) => (
      <div key={tone.toneId} className="tone-row">

        {/* Play / image column */}
        <div className="tone-play">
          <button className="tone-btn-play" title="Apply tone" onClick={() => onApplyTone(tone)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
          </button>
          {tone.imageUrl && <img src={tone.imageUrl} className="tone-thumb" alt="" />}
        </div>

        {/* Edit button */}
        {enableToneEditor && (
          <div className="tone-edit">
            <button className="tone-btn-icon" title="Edit" onClick={() => onEditTone(tone)}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
          </div>
        )}

        {/* Name + description */}
        <div className="tone-info">
          <span className="tone-name">{tone.name}</span>
          {tone.description && <span className="tone-desc">{tone.description}</span>}
        </div>

        {/* Tags */}
        <div className="tone-tags">
          
          {formatCategoryTags(tone.artists, "dark")}
          {formatCategoryTags(tone.categories, "success")}
        </div>

        {/* Favourite toggle */}
        <div className="tone-fav">
          {isFavouriteTone(tone) ? (
            <button className="tone-btn-icon tone-btn-danger" title="Remove favourite" onClick={() => deleteFavourite(tone)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>
                <path d="M9 6V4h6v2"/>
              </svg>
            </button>
          ) : (
            <button className="tone-btn-icon tone-btn-accent" title="Save favourite" onClick={() => saveFavourite(tone)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
              </svg>
            </button>
          )}
        </div>

      </div>
    ));
  };

  return (
    <div className="tone-list">
      {!toneList || toneList.length == 0 ? (
        <div className="tone-list-empty">{noResultsMessage}</div>
      ) : (
        <div>{renderToneList()}</div>
      )}
    </div>
  );
};

export default ToneListControl;
