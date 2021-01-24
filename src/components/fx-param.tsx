import * as React from "react";

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "webaudio-knob": any;
      "webaudio-switch": any;
    }
  }
}

const FxParam = ({ type = "knob", p, fx, onFxParamChange }) => {
  let customElement;

  const setParamValue = (e) => {
    console.log(
      `Changed param ${e.target.value} ${JSON.stringify(e.target.tag)} ${
        fx.name
      } ${fx.dspId}`
    );

    onFxParamChange({
      dspId: fx.dspId,
      index: e.target.tag.index,
      value: e.target.value,
      type: type
    });

  };

  React.useEffect(() => {
    //customElement?.addEventListener("input", setParamValue);
    customElement?.addEventListener("change", setParamValue);

    return () => {
     // customElement?.removeEventListener("input", setParamValue);
     customElement?.removeEventListener("change", setParamValue);
    };
  }, []);

  return (
    <div key={p.index?.toString() ?? p.toString()}>
      {type == "knob" ? (
        <div>
          <webaudio-knob
            ref={(elem) => {
              customElement = elem;
              if (customElement) customElement.tag = p;
            }}
            src="./lib/webaudio-controls/knobs/LittlePhatty.png"
            min="0"
            value={p.value}
            max="1"
            step="0.01"
          ></webaudio-knob>
          <label>{p.name}</label>
        </div>
      ) : (
        <div>
          <webaudio-switch
            ref={(elem) => {
              customElement = elem;
              if (customElement) customElement.tag = p;
            }}
            src="./lib/webaudio-controls/knobs/switch_toggle.png"
            value={fx.active == true ? "1" : "0"}
          ></webaudio-switch>
        </div>
      )}
    </div>
  );
};

export default FxParam;
