import React, { useEffect } from "react";
import { Tone } from "../core/soundshedApi";
import { appViewModel } from "./app";


const ToneListControl = ({ toneList, favourites, onApplyTone, onEditTone, noneMsg, enableToneEditor }) => {

    let noResultsMessage = noneMsg ?? "No results";

    useEffect(() => { }, [toneList, favourites]);

    const isFavouriteTone = (t: Tone): boolean => {


        if (favourites.find(f => f.toneId == t.toneId || (t.toneId != null && f.externalId == t.externalId))) {
            return true;
        } else {
            return false;
        }
    }

    const saveFavourite = (t: Tone) => {
        appViewModel.storeFavourite(t, false);
    }

    const deleteFavourite = (t: Tone) => {
        appViewModel.deleteFavourite(t);
    }

    const mapDeviceType = (t) => {
        if (t == "pg.spark40") {
            return "Spark 40";
        } else {
            return "Unknown Device Type";
        }
    };

    const formatCategoryTags = (items: string[], variant: string = "secondary") => {
        return items.map((i) => (
            <span key={i} className={"badge rounded-pill bg-" + variant}>
                {i}
            </span>
        ));
    };


    const renderToneList = () => {

        return toneList.map((tone: Tone) => (
            <div key={tone.toneId} className="tone">
                <div className="row">
                    {tone.imageUrl ? (
                        <div className="col-md-1">

                            <button
                                className="btn btn-sm btn-secondary"
                                onClick={() => {
                                    onApplyTone(tone);
                                }}
                            >
                                ▶
              </button>

                            <img src={tone.imageUrl} width="64px" />

                        </div>
                    ) : (
                            <div className="col-md-1">
                                <button
                                    className="btn btn-sm btn-secondary"
                                    onClick={() => {
                                        onApplyTone(tone);
                                    }}
                                >
                                    ▶
              </button>
                            </div>

                        )}

                    {enableToneEditor ? (
                        <div className="col-md-1 ms-2">
                            <button
                                className="btn btn-sm btn-secondary"
                                onClick={() => {
                                    onEditTone(tone);
                                }}
                            >
                                📝
                </button>
                        </div>
                    ) : (
                            ""
                        )}

                    <div className="col-md-4">
                        <label>{tone.name}</label>
                        <p>{tone.description}</p>
                    </div>
                    <div className="col-md-4">
                        {formatCategoryTags(tone.artists, "dark")}
                        {formatCategoryTags(tone.categories, "success")}

                        <span className="badge rounded-pill bg-primary">
                            {mapDeviceType(tone.deviceType)}
                        </span>
                    </div>
                    <div className="col-md-1">

                        {(() => {
                            if (isFavouriteTone(tone) == true) {
                                return (
                                    <button className="btn btn-sm btn-danger" onClick={() => { deleteFavourite(tone) }}>🗑</button>

                                );
                            }
                            else {
                                return (
                                    <button className="btn btn-sm btn-primary" onClick={() => { saveFavourite(tone) }}> ⭐</button>
                                );
                            }
                        })()
                        }
                    </div>
                </div>
            </div>
        ));

    };

    return (

        <div>
            {
                (!toneList || toneList.length == 0) ?
                    (
                        <div>{noResultsMessage}</div>
                    ) : (
                        <div>
                            { renderToneList()}
                        </div>
                    )
            }
        </div>

    )

};

export default ToneListControl;