import React from "react";
import { Tone } from "../../core/soundshedApi";
import FxControl from "./fx-control";

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "webaudio-knob": any;
      "webaudio-switch": any;
    }
  }
}

const SignalPathControl = ({
  signalPathState,
  onFxParamChange,
  onFxToggle,
  selectedChannel,
  onStoreFavourite,
}) => {
  const listItems = (t: Tone) => {
    if (!t) {
      return <div>Not Connected</div>;
    } else {
      return t.fx.map((fx) => fx.type!="pg.spark40."? (
        <td key={fx.type.toString()}>
          <FxControl
            fx={fx}
            onFxParamChange={onFxParamChange}
            onFxToggle={onFxToggle}
          ></FxControl>
        </td>
      ):"");
    }
  };

  return (
    <div>
      {!signalPathState ||
      !signalPathState.fx ||
      signalPathState.fx.length == 0 ? (
        <div className="container">
          <label>
            No preset selected (or amp not connected). Connect and refresh to
            get current amp settings. You may need to select a preset button on
            the amp to start.
            {JSON.stringify(signalPathState)}
          </label>
        </div>
      ) : (
        <div className="container">
          <h6>Tone Signal Chain</h6>

          <div className="row">
            <div className="col-md-8">
              <h4 className="preset-name">{signalPathState.name}</h4>
            </div>
            <div className="col-md-2">
              <button
                className="btn btn-sm btn-primary"
                onClick={() => {
                  onStoreFavourite(false);
                }}
              >
                ⭐
              </button>
            </div>
          
          </div>
          <table>
            <tbody>
            <tr>{listItems(signalPathState)}</tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default SignalPathControl;
