import * as React from "react";
import { Tone } from "../core/soundshedApi";
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
  React.useEffect(() => {
console.log("Signal Path UI updated.");

  }, [signalPathState, selectedChannel]);

  const listItems = (t:Tone) => {
    if (!t) {
      return <div>Not Connected</div>;
    } else {
      return t.fx.map((fx) => (
        <div key={fx.type.toString()} className="col-md-2">
          <FxControl
            fx={fx}
            onFxParamChange={onFxParamChange}
            onFxToggle={onFxToggle}
          ></FxControl>
        </div>
      ));
    }
  };

  return (
    <div>
      {!signalPathState || !signalPathState.fx || signalPathState.fx.length == 0 ? (
        <div className="container">
          <label>
            No preset selected (amp not connected). Connect and refresh to get
            current amp settings.
          </label>
        </div>
      ) : (
        <div className="container">
          <h6>Tone Signal Chain</h6>

          <div className="row">
            <div className="col-md-8">
              <h4 className="preset-name">
                {signalPathState.name}
              </h4>
            </div>
            <div className="col-md-2">
              <button
                className="btn btn-sm btn-primary"
                onClick={()=>{onStoreFavourite(false)}}
              >
                ⭐
              </button>
            </div>
            <div className="col-md-2">
              <button
                className="btn btn-sm btn-primary"
                onClick={() => {
                  onStoreFavourite(true);
                }}
              >
                🔗 Share
              </button>
            </div>
          </div>

          <div className="row">{listItems(signalPathState)}</div>
        </div>
      )}
    </div>
  );
};

export default SignalPathControl;
