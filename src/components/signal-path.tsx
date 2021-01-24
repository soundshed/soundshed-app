import * as React from "react";
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
  React.useEffect(() => {}, [signalPathState, selectedChannel]);

  if (signalPathState.sigpath == null) signalPathState.sigpath = [];

  const listItems = signalPathState.sigpath.map((fx) => (
    <div key={fx.dspId.toString()} className="col-md-2">
      <FxControl
        fx={fx}
        onFxParamChange={onFxParamChange}
        onFxToggle={onFxToggle}
      ></FxControl>
    </div>
  ));

  return (
    <div>
      {!signalPathState || signalPathState.sigpath.length==0 ? (
        <div className="container">
        <label>No preset selected (amp not connected). Connect and refresh to get current amp settings.</label>
        </div>
      ) : (
        <div className="container">
          <h6>Tone Signal Chain</h6>

          <div className="row">
            <div className="col-md-8">
              <h4 className="preset-name">
                [{selectedChannel + 1}] {signalPathState.meta?.name}
              </h4>
            </div>
            <div className="col-md-2">
              <button
                className="btn btn-sm btn-primary"
                onClick={onStoreFavourite}
              >
                ⭐ Favourite
              </button>
            </div>
            <div className="col-md-2">
              <button
                className="btn btn-sm btn-primary"
                onClick={()=>{onStoreFavourite(true)}}
              >
                🔗 Share
              </button>
            </div>
          </div>

          <div className="row">{listItems}</div>
        </div>
      )}
    </div>
  );
};

export default SignalPathControl;
