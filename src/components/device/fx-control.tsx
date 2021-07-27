import React, { useEffect } from "react";
import FxParam from "./fx-param";
import { deviceViewModel } from "../app";
import { FxCatalogItem } from "../../spork/src/interfaces/preset";
import { DeviceStateStore } from "../../stores/devicestate";

const FxControl = ({ fx, onFxParamChange, onFxToggle }) => {
  const fxCatalog = DeviceStateStore.useState((s) => s.fxCatalog);
  const [fxList, setFxList] = React.useState([]);
  const [isExperimentalFxSelected, setIsExperimentalFxSelected] =
    React.useState(false);
  const fxTypeId = React.useMemo(() => {
    return fx.type;
  }, [fx]);

  React.useEffect(() => {
    const fxDefinition: FxCatalogItem = fxCatalog.catalog.find(
      (t) => t.dspId == fx.type
    );

    if (fxDefinition) {
      const listOfSameTypeFx = fxCatalog.catalog.filter(
        (t) => t.type == fxDefinition.type
      );

      setFxList(listOfSameTypeFx);

      setIsExperimentalFxSelected(fxDefinition.isExperimental == true);
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
    deviceViewModel
      .requestFxChange({ dspIdOld: fx.type, dspIdNew: e.target.value })
      .then(() => {
        // deviceViewModel.requestPresetConfig();
      });
  };

  const mapFxTypeIdToName = (t) => {
    if (fxCatalog) {
      var fxItem = fxCatalog.catalog.find((f) => f.dspId == t);
      if (fxItem) {
        return (
          fxCatalog.types.find((i) => i.id == fxItem.type)?.name ??
          t.replace("pg.spark40.", "")
        );
      } else {
        return t.replace("pg.spark40.", "");
      }
    } else {
      return t;
    }
  };

  const fxToggle = () => {
    onFxToggle({
      dspId: fx.type,
      value: fx.enabled == true ? "0" : "1",
      type: "toggle",
    });
  };

  return (
    <div className="fx">
      <label className="fx-type">{mapFxTypeIdToName(fxTypeId)}</label>
      <div>
        <h4 className="preset-name">{fx.name}</h4>

        <select value={fxTypeId} onChange={handleFxChange}>
          {fxList.map((e, key) => {
            return (
              <option key={key} value={e.dspId}>
                {e.name}
              </option>
            );
          })}
        </select>

        {isExperimentalFxSelected ? (
          <span
            className="badge rounded-pill bg-danger m-1"
            title="Experimental FX - may not work at all."
          >
            Experimental FX
          </span>
        ) : (
          ""
        )}

        <div className="fx-controls">
          <FxParam
            type="switch"
            p="toggle"
            fx={fx}
            onFxParamChange={onFxToggle}
          ></FxParam>

          {fx.enabled ? (
            <span className="badge rounded-pill bg-success" onClick={fxToggle}>
              On
            </span>
          ) : (
            <span className="badge rounded-pill bg-danger" onClick={fxToggle}>
              Off
            </span>
          )}
          <div className="mt-2">{paramControls}</div>
        </div>
      </div>
    </div>
  );
};

export default FxControl;
