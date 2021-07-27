import React, { useEffect } from "react";
import WebMidi from "webmidi";
import { InputEventMapping, KeyboardEventSource } from "../../spork/src/interfaces/inputEventMapping";
import { AppStateStore } from "../../stores/appstate";
import { appViewModel, deviceViewModel } from "../app";
const InputEventsControl = () => {

  const inputEventMappings: InputEventMapping[] = AppStateStore.useState(
    (s) => s.inputEventMappings
  );

  React.useEffect(() => {

    console.log(inputEventMappings);

    setupMidi();
  }, [inputEventMappings]);

  useEffect(() => {
    console.log("setting up midi/keyboard listeners");
  
  }, []);

  let midiInitialized = false;


  const setupMidi = () => {
    if (midiInitialized) return;

    (navigator as any).requestMIDIAccess().then(() => {
      WebMidi.enable( (err) =>{
        if (err) {
          console.log("WebMidi could not be enabled.", err);
          midiInitialized = false;
        } else {
          console.log("WebMidi enabled!");

          console.log(WebMidi.inputs);
          console.log(WebMidi.outputs);

          var midiInputDevice = "microKEY-25";
          var input = WebMidi.getInputByName(midiInputDevice);

        

          midiInitialized = true;

          //TODO: midi input selection
          //TODO: set listener on startup if any events are trained

          for(let mapping of inputEventMappings){
            if (mapping.source.type === "keyboard"){
              console.log("setting up keyboard listener for " + mapping.source.code);
             
            } else if(mapping.source.type=== "midi"){
              console.log("setting up midi listener for " + mapping.source.code);
              
            }
          }

          (input as any).addListener("noteon", "all",  (e)=> {
            console.log(e);
            /*console.log("CH: " + e.channel);
            console.log("Note: " + e.note.number);
            console.log("Velocity: " + e.velocity);

            console.log(e);*/
            for(let mapping of inputEventMappings){
              if (mapping.source.type === "midi"){
                if (mapping.source.code==e.note.number){
               
                  deviceViewModel.setChannel(parseInt(mapping.target.value));
                }
            
              }
            }
          });
      }
    });
    }, false);
  };

  return <div><small><em>Listening for midi/keyboard input events</em></small></div>;
};

export default InputEventsControl;


