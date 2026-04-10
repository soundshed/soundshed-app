import React from "react";
import ToneChooserModal from "../soundshed/tone-chooser-modal";
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
  const [showToneChooser, setShowToneChooser] = React.useState(false);

  return (
    <div>
      {!signalPathState || !signalPathState.fx || signalPathState.fx.length === 0 ? (
        <div className="info" style={{ maxWidth: 520 }}>
          <p style={{ margin: 0 }}>
            No preset selected — amp may not be connected. Connect and refresh to
            load current amp settings. You may need to select a preset on the amp
            first.
          </p>
        </div>
      ) : (
        <div>
          <div className="signal-path-header">
            <h6 style={{ margin: 0, color: "var(--text-muted)" }}>
              Tone Signal Chain
            </h6>
            <span className="preset-name" style={{ fontSize: "1rem" }}>
              {signalPathState.name}
            </span>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                className="btn btn-sm btn-secondary"
                title="Save as Favourite"
                onClick={() => onStoreFavourite(false)}
              >
                ⭐ Favourite
              </button>
              <button
                className="btn btn-sm btn-secondary"
                onClick={() => setShowToneChooser(true)}
              >
                Browse Tones
              </button>
            </div>
          </div>

          <div className="signal-path-container">
            <div className="signal-path-chain">
              {signalPathState.fx.map((fx) =>
                fx.type !== "pg.spark40." ? (
                  <FxControl
                    key={fx.type.toString()}
                    fx={fx}
                    onFxParamChange={onFxParamChange}
                    onFxToggle={onFxToggle}
                  />
                ) : null
              )}
            </div>
          </div>
        </div>
      )}
      <ToneChooserModal show={showToneChooser} onClose={() => setShowToneChooser(false)} />
    </div>
  );
};

export default SignalPathControl;
