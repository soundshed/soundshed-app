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
      } ${fx.type}`
    );

    onFxParamChange({
      dspId: fx.type,
      index: e.target.tag.paramId,
      value: e.target.value,
      type: type,
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

  React.useEffect(() => {
    var newVal = p.value ?? null;
    if (newVal != null) {
      newVal = newVal.toFixed(newVal);
    }
    if (customElement.value != newVal && newVal != null) {
      console.log(
        "Control Strip UI updated. " + customElement.value + " :: " + newVal
      );
      customElement?.setValue(newVal);
    } else {
      console.log(JSON.stringify(p));
    }
  }, [fx, p]);

  return (
    <div key={p.paramId?.toString() ?? p.toString()}>
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
            diameter="64"
            tooltip={p.name + " %s"}
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
            value={fx.enabled == true ? "1" : "0"}
          ></webaudio-switch>
        </div>
      )}
    </div>
  );
};

export default FxParam;
