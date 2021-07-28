import React, { useEffect } from "react";
import WebMidi from "webmidi";
import { InputEventMapping } from "../../spork/src/interfaces/inputEventMapping";
import { AppStateStore } from "../../stores/appstate";
import { appViewModel, deviceViewModel } from "../app";
const InputEventsControl = () => {
  const inputEventMappings: InputEventMapping[] = AppStateStore.useState(
    (s) => s.inputEventMappings
  );

  React.useEffect(() => {
    if (inputEventMappings != null && inputEventMappings.length > 0) {
      console.log(inputEventMappings);

      setupKeyboardEvents();
      setupMidiEvents();
    }
  }, [inputEventMappings]);

  useEffect(() => {
    console.log("setting up midi/keyboard listeners");
  }, []);

  let midiInitialized = false;
  let keyboardInitialized = false;

  const setupMidiEvents = () => {
    if (midiInitialized) return;

    (navigator as any).requestMIDIAccess().then(() => {
      WebMidi.enable((err) => {
        if (err) {
          console.log("WebMidi could not be enabled.", err);
          midiInitialized = false;
        } else {
          console.log("WebMidi enabled.");

          midiInitialized = true;

          console.log(WebMidi.inputs);
          console.log(WebMidi.outputs);

          var midiInputDevice = "microKEY-25";
          var input = WebMidi.getInputByName(midiInputDevice);

          // listen for midi inputs and match inputs to mapping

          (input as any).addListener("noteon", "all", (e) => {
            console.log(e);
            /*console.log("CH: " + e.channel);
            console.log("Note: " + e.note.number);
            console.log("Velocity: " + e.velocity);

            console.log(e);*/
            for (let mapping of inputEventMappings) {
              if (mapping.source.type === "midi") {
                if (mapping.source.code == e.note.number) {
                  deviceViewModel
                    .setChannel(parseInt(mapping.target.value))
                    .then(() => {
                      console.log(
                        "Midi input event channel selection:" +
                          mapping.target.value
                      );
                    });
                }
              }
            }
          });
        }
      });
    }, false);
  };

  const setupKeyboardEvents = () => {
    if (keyboardInitialized) return;

    keyboardInitialized = true;

    // listen for keyboard inputs and match inputs to mapping
    window.addEventListener(
      "keydown",
      (event) => {
        if (event.defaultPrevented) {
          return; // Do nothing if the event was already processed
        }

        if (event.repeat){
          return; // discard repeated key events
        }

        if (inputEventMappings != null && inputEventMappings.length > 0) {
          for (let mapping of inputEventMappings) {
            if (mapping.source.type === "keyboard") {
              if (mapping.source.code == event.key) {
                deviceViewModel
                  .setChannel(parseInt(mapping.target.value))
                  .then(() => {
                    console.log(
                      "Keyboard input event channel selection:" +
                        mapping.target.value
                    );
                  });
              }
            }
          }

          // Cancel the default action to avoid it being handled twice
          event.preventDefault();
        }
      },
      true
    );
  };

  return (
    <div>
      <small>
        <em>Listening for midi/keyboard input events</em>
      </small>
    </div>
  );
};

export default InputEventsControl;
