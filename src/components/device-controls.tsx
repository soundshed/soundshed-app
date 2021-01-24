import * as React from "react";

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "webaudio-knob": any;
    }
  }
}

const DeviceControls = () => {
  return (
    <div>
     
      <div>
        <div className="container">
        <h6>Device Controls  <span className="badge rounded-pill bg-secondary">
            Spark 40
          </span></h6>
          <div className="row control-strip">
            <div className="col-sm">
              <webaudio-knob
                id="knob-gain"
                src="./lib/webaudio-controls/knobs/LittlePhatty.png"
                min="0"
                max="100"
              ></webaudio-knob>
              <label className="control-label">Gain</label>
            </div>
            <div className="col-sm">
              <webaudio-knob
                id="knob-bass"
                src="./lib/webaudio-controls/knobs/LittlePhatty.png"
                min="0"
                max="100"
              ></webaudio-knob>
              <label className="control-label">Bass</label>
            </div>
            <div className="col-sm">
              <webaudio-knob
                id="knob-mid"
                src="./lib/webaudio-controls/knobs/LittlePhatty.png"
                min="0"
                max="100"
              ></webaudio-knob>
              <label className="control-label">Mid</label>
            </div>
            <div className="col-sm">
              <webaudio-knob
                id="knob-treble"
                src="./lib/webaudio-controls/knobs/LittlePhatty.png"
                min="0"
                max="100"
              ></webaudio-knob>
              <label className="control-label">Treble</label>
            </div>

            <div className="col-sm">
              <webaudio-knob
                id="knob-master"
                src="./lib/webaudio-controls/knobs/LittlePhatty.png"
                min="0"
                max="100"
              ></webaudio-knob>
              <label className="control-label">Master</label>
            </div>
            <div className="col-sm">
              <webaudio-knob
                id="knob-mod"
                src="./lib/webaudio-controls/knobs/LittlePhatty.png"
                min="0"
                max="100"
              ></webaudio-knob>
              <label className="control-label">Modulation</label>
            </div>
            <div className="col-sm">
              <webaudio-knob
                id="knob-delay"
                src="./lib/webaudio-controls/knobs/LittlePhatty.png"
                min="0"
                max="100" 
              ></webaudio-knob>
              <label className="control-label">Delay</label>
            </div>
            <div className="col-sm">
              <webaudio-knob
                id="knob-reverb"
                src="./lib/webaudio-controls/knobs/LittlePhatty.png"
                min="0"
                max="100"
              ></webaudio-knob>
              <label className="control-label">Reverb</label>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeviceControls;
