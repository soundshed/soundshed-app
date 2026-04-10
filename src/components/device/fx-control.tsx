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
      let listOfSameTypeFx : FxCatalogItem[] = fxCatalog.catalog.filter(
        (t) => t.type == fxDefinition.type && t.isRemoved != true
      );
      listOfSameTypeFx = listOfSameTypeFx.sort((a,b)=>{ return a.name<=b.name?-1:1});

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
    deviceViewModel
      .requestFxChange({ dspIdOld: fx.type, dspIdNew: e.target.value })
      .then((changedOk) => {
        if (!changedOk) {
          alert(
            "Fx change failed. FX type may have been removed, or amp not connected"
          );
        }
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
    <div
      className={`fx ${fx.enabled ? "fx-enabled" : "fx-disabled"}`}
      role="group"
      aria-label={`${mapFxTypeIdToName(fxTypeId)} effect`}
    >
      <label className="fx-type" htmlFor={`fx-select-${fx.type}`}>{mapFxTypeIdToName(fxTypeId)}</label>
      <span className="preset-name">{fx.name}</span>

      <select id={`fx-select-${fx.type}`} value={fxTypeId} onChange={handleFxChange} aria-label={`Select ${mapFxTypeIdToName(fxTypeId)} type`}>
        {fxList.map((e, key) => (
          <option key={key} value={e.dspId}>
            {e.name}
          </option>
        ))}
      </select>

      {isExperimentalFxSelected && (
        <span className="experimental-badge" title="Experimental FX – may not work.">
          ⚠ Experimental
        </span>
      )}

      <div className="fx-controls">
        <FxParam
          type="switch"
          p="toggle"
          fx={fx}
          onFxParamChange={onFxToggle}
        />
        <button
          type="button"
          className={`fx-toggle-badge ${fx.enabled ? "on" : "off"}`}
          onClick={fxToggle}
          aria-pressed={fx.enabled}
          aria-label={`${mapFxTypeIdToName(fxTypeId)} ${fx.enabled ? "enabled" : "disabled"}, click to toggle`}
        >
          {fx.enabled ? "On" : "Off"}
        </button>
        <div style={{ marginTop: "0.5rem" }}>{paramControls}</div>
      </div>
    </div>
  );
};

export default FxControl;
