import React from "react";

import { appViewModel } from "./app";
import Button from "react-bootstrap/Button";
import { AppStateStore } from "../stores/appstate";
import { openLink } from "../core/platformUtils";
import env from "../env";
import WebMidi from "webmidi";

const SettingsControl = () => {
  let midiInitialized = false;
  React.useEffect(() => {}, []);

  const setupTest = () => {
    if (midiInitialized) return;

    (navigator as any).requestMIDIAccess().then(()=> { 

      WebMidi.enable(function (err) {
        if (err) {
          console.log("WebMidi could not be enabled.", err);
          midiInitialized = false;
        } else {
          console.log("WebMidi enabled!");
  
          console.log(WebMidi.inputs);
          console.log(WebMidi.outputs);
  
          var midiInputDevice= "microKEY-25";
          var input = WebMidi.getInputByName(midiInputDevice);
  
          (input as any).addListener("noteon", "all", function (e) {
            console.log("CH: " + e.channel);
            console.log("Note: " + e.note.number);
            console.log("Velocity: " + e.velocity);
  
            console.log(e);
          });
  
          midiInitialized = true;
          alert("Midi Listening: "+midiInputDevice);
          //TODO: midi input selection
          //TODO: set listener on startup if any events are trained
  
        }
      });
     }, false);

    
  };

  return (
    <div className="setting-intro">
      <h1>Settings</h1>

      <p>Test</p>
      <Button
        className="btn btn-sm"
        onClick={() => {
          setupTest();
        }}
      >
        Start Midi
      </Button>
    </div>
  );
};

export default SettingsControl;
