import * as React from "react";
import FxParam from "./fx-param";
import { deviceViewModel } from "./app";
import { DeviceStore } from "../core/deviceViewModel";
declare global {
  namespace JSX {
    interface IntrinsicElements {
      "webaudio-knob": any;
      "webaudio-switch": any;
    }
  }
}

const FxControl = ({ fx, onFxParamChange, onFxToggle }) => {
  const fxCatalog = DeviceStore.useState((s) => s.fxCatalog);
  const [fxList, setFxList] = React.useState([]);
  const fxTypeId = React.useMemo(() => {return fx.type}, [fx]);

  React.useEffect(() => {
    const fxDefinition = fxCatalog.catalog.find((t) => t.dspId == fx.type);
    if (fxDefinition) {
      const listOfSameTypeFx = fxCatalog.catalog.filter(
        (t) => t.type == fxDefinition.type
      );
      setFxList(listOfSameTypeFx);
    }
  }, [fx, fxCatalog]);

  const paramControls = fx.params.map((p) => (
    <FxParam
      key={p.paramId.toString()}
      p={p}
      fx={fx}
      onFxParamChange={onFxParamChange}
    ></FxParam>
  ));

  const handleFxChange = (e) => {
    //this.setState({value: event.target.value});
    deviceViewModel.requestFxChange({ dspIdOld:fx.type,dspIdNew:e.target.value})
    .then(()=>{

     // deviceViewModel.requestPresetConfig();
    });
  };

  const mapFxTypeIdToName=(t)=>{
    if (fxCatalog){
      var fxItem= fxCatalog.catalog.find((f) => f.dspId == t);
      if (fxItem){
        return fxCatalog.types.find(i=>i.id==fxItem.type)?.name ?? t.replace("pg.spark40.","");
      } else {
        return t.replace("pg.spark40.","");
      }
    } else {
      return t;
    }
  }

  return (
    <div className="fx">

      <label className="fx-type">{mapFxTypeIdToName(fxTypeId)}</label>
      <div >
        <h4 className="preset-name">{fx.name}</h4>
       
        <select value={fxTypeId} onChange={handleFxChange}>
            {fxList.map((e, key) => {
            return <option key={key} value={e.dspId}>{e.name}</option>;
        })}
         
        </select>
        <div className="fx-controls">
          {paramControls}

          <FxParam
            type="switch"
            p="toggle"
            fx={fx}
            onFxParamChange={onFxToggle}
          ></FxParam>

          {fx.enabled ? <span className="badge rounded-pill bg-success">On</span> : <span className="badge rounded-pill bg-danger">Off</span>}
        </div>
      </div>
    </div>
  );
};

export default FxControl;
