import React from "react";
import { Dropdown } from "react-bootstrap";
import Button from "react-bootstrap/Button";
import { WebConnectionTest } from "../core/tests/webConnectionTest";
import { Utils } from "../core/utils";
import { InputEventMapping } from "../spork/src/interfaces/inputEventMapping";
import { AppStateStore } from "../stores/appstate";
import { appViewModel } from "./app";

const SettingsControl = () => {
  const inputEventMappings = AppStateStore.useState(
    (s) => s.inputEventMappings
  );
  const selectedMidiInput = AppStateStore.useState((s) => s.selectedMidiInput);

  const midiInputs = AppStateStore.useState((s) => s.midiInputs);

  React.useEffect(() => {}, [inputEventMappings, midiInputs]);

  const deleteInputMapping = (mapping: InputEventMapping) => {};

  const enableTestMode = true;

  const runTests = async () => {
    if (!(window as any).webTest) {
      (window as any).webTest = new WebConnectionTest();
    }

    (window as any).webTest.RunTest();
  };
  
  const learnInputMapping = async (mapping: InputEventMapping) => {
    AppStateStore.update((s) => {
      s.lastMidiEvent = null;
    });

    let capturedEvent = null;
    let maxLoop = 10;
    while (capturedEvent == null) {
      if (AppStateStore.getRawState().lastMidiEvent != null) {
        capturedEvent = AppStateStore.getRawState().lastMidiEvent;
      } else {
        maxLoop--;
        await Utils.sleepAsync(500);

        if (maxLoop <= 0) {
          break;
        }
      }
    }

    if (capturedEvent != null) {
      console.log("Trained midi::" + capturedEvent.type);
      let midiEvent = getNormalisedMidiEvent(capturedEvent);

      let newMappings = JSON.parse(JSON.stringify(inputEventMappings));

      for (let m of newMappings) {
        if (m.id == mapping.id) {
          m.source.code = midiEvent.value;
        }
      }

      AppStateStore.update((s) => {
        s.inputEventMappings = newMappings;
      });

      appViewModel.saveSettings();
    } else {
      console.log("No midi input detected within time allowed");
    }
  };

  const getNormalisedMidiEvent = (e: any) => {
    if (e.type == "programchange") {
      return { value: e.value.toString() };
    } else if (e.type == "noteon") {
      return { value: e.note.number.toString() };
    }
  };

  const selectMidiInput = (i: any) => {
    AppStateStore.update((s) => {
      s.selectedMidiInput = i.name;
    });

    setTimeout(() => {
      appViewModel.saveSettings();
    }, 500);
  };

  const renderInputEventMappings = () => {
    return inputEventMappings.map((mapping: InputEventMapping) => (
      <tr key={mapping.id}>
        <th>{mapping.name}</th>
        <td>{mapping.source.type}</td>
        <td>{mapping.source.code}</td>
        <td>{mapping.target.type}</td>
        <td>{mapping.target.value}</td>
        <td>
          {" "}
          <Button
            disabled
            className="btn btn-sm"
            onClick={() => {
              deleteInputMapping(mapping);
            }}
          >
            Delete
          </Button>
        </td>
        <td>
          {" "}
          <Button
            className="btn btn-sm"
            onClick={() => {
              learnInputMapping(mapping);
            }}
          >
            Learn
          </Button>
        </td>
      </tr>
    ));
  };

  const renderMidiInputs = () => {
    return midiInputs.map((i) => (
      <Dropdown.Item
        key={i.name}
        onClick={() => {
          selectMidiInput(i);
        }}
      >
        {i.name}
      </Dropdown.Item>
    ));
  };

  return (
    <div className="settings-intro">
      <h1>Settings</h1>

      <Dropdown>
        <Dropdown.Toggle variant="success" id="dropdown-basic">
          Select Midi Input
        </Dropdown.Toggle>

        <Dropdown.Menu>{renderMidiInputs()}</Dropdown.Menu>
      </Dropdown>

      <span className="badge rounded-pill bg-secondary">
        {selectedMidiInput}
      </span>

      <h2>Input Event Mappings</h2>
      <p>You can optionally map keyboard or midi inputs to amp channels.</p>

      <table className="table table-striped">
        <tbody>{renderInputEventMappings()}</tbody>
      </table>

      {enableTestMode ? (
        <div>
          <button
            onClick={() => {
              runTests();
            }}
          >
            Test
          </button>
        </div>
      ) : (
        ""
      )}
    </div>
  );
};

export default SettingsControl;
