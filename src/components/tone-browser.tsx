import * as React from "react";
import { useEffect } from "react";
import { FxMappingToneToSpark } from "../core/fxMapping";
import { Tone } from "../core/soundshedApi";
import { DeviceViewModelContext } from "./app";

const ToneBrowserControl = (props) => {
  const deviceViewModel = React.useContext(DeviceViewModelContext);

  const onApplyTone = (t) => {
    if (!deviceViewModel.isConnected)
    {
      alert("the device is not yet connected, see Amp tab");
      return;
    }
    let p = new FxMappingToneToSpark().mapFrom(t);
    deviceViewModel.requestPresetChange(p);
  };

  const mapDeviceType = (t) => {
    if (t == "pg.spark40") {
      return "Spark 40";
    } else {
      return "Unknown Device Type";
    }
  };

  useEffect(() => {}, [props.tones, props.favourites]);

  const listItems = (t: Tone[]) => {
    if (!t) {
      return <div>None</div>;
    }

    return t.map((tone: Tone) => (
      <div key={tone.toneId} className="tone">
        <div className="row">
          <div className="col-md-2">
            <button
              className="btn btn-sm btn-secondary"
              onClick={() => {
                onApplyTone(tone);
              }}
            >
              ▶
            </button>
          </div>
          <div className="col-md-6">
            <label>{tone.name}</label>
          </div>
          <div className="col-md-2">
            {" "}
            <span className="badge rounded-pill bg-secondary">
              {mapDeviceType(tone.deviceType)}
            </span>
          </div>
        </div>
        <div className="row">
          <p>{tone.description}</p>
        </div>
      </div>
    ));
  };

  return (
    <div className="tones-intro">
      <h1>Tones</h1>

      <p>Browse and manage favourite tones.</p>

      <div className="info">
        <h3>Favourites</h3>
        {!props.favourites || props.favourites == [] ? (
          <label>No favourite tones saved.</label>
        ) : (
          <div>{listItems(props.favourites)}</div>
        )}


        <h3>Community</h3>
        {!props.tones || props.tones == [] ? (
          <label>Community tones not loaded.</label>
        ) : (
          <div>{listItems(props.tones)}</div>
        )}

      </div>
    </div>
  );
};

export default ToneBrowserControl;
