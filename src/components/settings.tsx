import React from "react";
import Button from "react-bootstrap/Button";
import { InputEventMapping } from "../spork/src/interfaces/inputEventMapping";
import { AppStateStore } from "../stores/appstate";

const SettingsControl = () => {

  const inputEventMappings = AppStateStore.useState(
    (s) => s.inputEventMappings
  );

  React.useEffect(() => {}, [inputEventMappings]);

  const renderInputEventMappings = () => {
    return inputEventMappings.map((mapping: InputEventMapping) => (
      <div key={mapping.name}>
        <h3>{mapping.name}</h3>
        <p>{mapping.source.type}</p>
        <p>{mapping.target.type} : {mapping.target.value}</p>
        
      </div>
    ));
  }

  return (
    <div className="settings-intro">
      <h1>Settings</h1>

      <h2>Input Event Mappings</h2>
      <p>You can optionally map keyboard or midi inputs to amp channels or specific presets.</p>

      <div>{renderInputEventMappings()}</div>
     
    </div>
  );
};

export default SettingsControl;
