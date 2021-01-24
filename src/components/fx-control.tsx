import * as React from "react";
import FxParam from "./fx-param";

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "webaudio-knob": any;
      "webaudio-switch": any;
    }
  }
}

const FxControl = ({ fx, onFxParamChange, onFxToggle }) => {


  React.useEffect(() => {
    
  }, [fx]);

  const paramControls = fx.params.map((p) => (
    <FxParam key={p.index.toString()} p={p} fx={fx} onFxParamChange={onFxParamChange}></FxParam>
  ));

  return (
    <div>
    <label className="fx-type">{fx.type}</label>
    <div className="fx">
     
      <h4 className="preset-name">{fx.name}</h4>
      <div className="fx-controls">
        {paramControls}

        <FxParam type="switch" p="toggle" fx={fx} onFxParamChange={onFxToggle}></FxParam>
    
        {fx.active ? <label>On</label> : <label>Off</label>}
      </div>
      {/*<pre>{JSON.stringify(fx)}</pre>*/}
    </div>
    </div>
  );
};

export default FxControl;
