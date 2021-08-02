import React, { useEffect } from "react";
import WebMidi from "webmidi";
import { InputEventMapping } from "../../spork/src/interfaces/inputEventMapping";
import { AppStateStore } from "../../stores/appstate";
import { appViewModel, deviceViewModel } from "../app";
const InputEventsControl = () => {
  const inputEventMappings: InputEventMapping[] = AppStateStore.useState(
    (s) => s.inputEventMappings
  );

  const selectedMidiInput: string = AppStateStore.useState(
    (s) => s.selectedMidiInput
  );

  useEffect(() => {
    console.log("Midi/input events changed : " + selectedMidiInput);

    if (selectedMidiInput != null) {
      setupMidiEvents(true);
    } else {
      // first-time pass to get available midi devices
      setupMidiEvents();
    }

    if (inputEventMappings != null && inputEventMappings.length > 0) {
      setupKeyboardEvents();
    }
  }, [selectedMidiInput, inputEventMappings]);

  let midiInitialized = false;
  let keyboardInitialized = false;

  const setupMidiEvents = (refreshSettings: boolean = false) => {
    if (midiInitialized && !refreshSettings) return;

    WebMidi.enable((err) => {
      if (err) {
        console.log("WebMidi could not be enabled.", err);
        midiInitialized = false;
      } else {
        console.log("WebMidi enabled.");

        midiInitialized = true;

        if (WebMidi.inputs != null) {
          AppStateStore.update((s) => {
            s.midiInputs = WebMidi.inputs.map((input) => {
              return {
                input: input,
                name: input.name,
                type: "midi",
              };
            });
          });
        }

        console.log(WebMidi.inputs);
        console.log(WebMidi.outputs);

        if (selectedMidiInput != null) {
          var input = WebMidi.getInputByName(selectedMidiInput);

          if (input) {
            console.log("midi input mapped: " + selectedMidiInput);
            AppStateStore.update((s) => {
              s.isMidiInputAvailable = true;
            });
            // listen for midi inputs and match inputs to mapping

            //remove old listeners
            (input as any).removeListener();

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
                      .catch((err) => {
                        console.log(
                          "Failed to set channel. Device may not be connected " +
                            err
                        );
                      })
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
          } else {
            // preferred midi device not connected
            AppStateStore.update((s) => {
              s.isMidiInputAvailable = false;
            });

            console.log("midi input could not be mapped: " + selectedMidiInput);
          }
        } else {
          console.log("No midi input selected, skipping midi input mappings");
        }
      }
    });
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

        if (event.repeat) {
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

  return <div></div>;
};

export default InputEventsControl;
