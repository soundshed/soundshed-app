import React from "react";
import { MessageParsingTest } from "../core/tests/messageParsingTest";
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

  const enableTestMode = false;

  const runConnectionTests = async () => {
    if (!(window as any).webTest) {
      (window as any).webTest = new WebConnectionTest();
    }

    (window as any).webTest.RunTest();
  };

  const runMessageTest = async () => {
 
     await new MessageParsingTest().Test();
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

  const [dropdownOpen, setDropdownOpen] = React.useState(false);

  const renderInputEventMappings = () => {
    return inputEventMappings.map((mapping: InputEventMapping) => (
      <div key={mapping.id} className="mapping-row">
        <span className="mapping-name">{mapping.name}</span>
        <span className="mapping-cell mapping-cell--muted">{mapping.source.type}</span>
        <span className="mapping-cell mapping-code">{mapping.source.code || <em>—</em>}</span>
        <span className="mapping-cell mapping-cell--muted">{mapping.target.type}</span>
        <span className="mapping-cell mapping-code">{mapping.target.value}</span>
        <div className="mapping-actions">
          <button
            className="settings-btn settings-btn--muted"
            disabled
            onClick={() => deleteInputMapping(mapping)}
          >
            Delete
          </button>
          <button
            className="settings-btn settings-btn--accent"
            onClick={() => learnInputMapping(mapping)}
          >
            Learn
          </button>
        </div>
      </div>
    ));
  };

  const renderMidiInputs = () => {
    return midiInputs.map((i) => (
      <button
        key={i.name}
        className="ss-dropdown-item"
        onClick={() => { selectMidiInput(i); setDropdownOpen(false); }}
      >
        {i.name}
      </button>
    ));
  };

  return (
    <div className="settings-intro">

      <div className="settings-header">
        <h1 className="settings-heading">Settings</h1>
        <p className="settings-sub">Configure MIDI mappings and amp input bindings.</p>
      </div>

      {/* ── MIDI Input section ── */}
      <div className="settings-section glass-panel">
        <div className="settings-section-header">
          <div>
            <h2 className="settings-section-title">MIDI Input</h2>
            <p className="settings-section-desc">Select the MIDI device to use for input event mappings.</p>
          </div>
        </div>

        {/* Custom dropdown */}
        <div className="ss-dropdown-wrap">
          <button
            className="ss-dropdown-toggle"
            onClick={() => setDropdownOpen((o) => !o)}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
            </svg>
            {selectedMidiInput || "Select MIDI Input"}
            <svg className={`ss-dropdown-chevron${dropdownOpen ? " open" : ""}`} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          {dropdownOpen && (
            <div className="ss-dropdown-menu">
              {midiInputs.length === 0
                ? <span className="ss-dropdown-empty">No MIDI inputs detected</span>
                : renderMidiInputs()
              }
            </div>
          )}
        </div>

        {selectedMidiInput && (
          <div className="settings-active-chip">
            <span className="settings-chip-dot" />
            {selectedMidiInput}
          </div>
        )}
      </div>

      {/* ── Input Event Mappings ── */}
      <div className="settings-section glass-panel">
        <div className="settings-section-header">
          <div>
            <h2 className="settings-section-title">Input Event Mappings</h2>
            <p className="settings-section-desc">Map keyboard or MIDI inputs to amp channels and actions.</p>
          </div>
        </div>

        {inputEventMappings && inputEventMappings.length > 0 ? (
          <div className="mapping-table">
            <div className="mapping-header-row">
              <span className="mapping-name">Action</span>
              <span className="mapping-cell">Source Type</span>
              <span className="mapping-cell mapping-code">Code</span>
              <span className="mapping-cell">Target Type</span>
              <span className="mapping-cell mapping-code">Value</span>
              <span className="mapping-actions" />
            </div>
            {renderInputEventMappings()}
          </div>
        ) : (
          <p className="settings-empty">No input mappings configured.</p>
        )}
      </div>

      {enableTestMode && (
        <div className="settings-section glass-panel">
          <h2 className="settings-section-title">Developer Tests</h2>
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
            <button className="settings-btn settings-btn--accent" onClick={runConnectionTests}>Connection Test</button>
            <button className="settings-btn settings-btn--accent" onClick={runMessageTest}>Message Reading Test</button>
          </div>
        </div>
      )}

    </div>
  );
};

export default SettingsControl;
