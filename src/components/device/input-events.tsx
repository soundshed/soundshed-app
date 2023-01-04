import React, { useEffect } from "react";
import { WebMidi } from "webmidi";
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

  const lastMidiEvent: object = AppStateStore.useState((s) => s.lastMidiEvent);

  useEffect(() => {
    console.log("Midi/input events changed : " + selectedMidiInput);

    if (selectedMidiInput != null) {
      setupMidiEvents(true, selectedMidiInput.toString());
    }

    if (inputEventMappings != null && inputEventMappings.length > 0) {
      setupKeyboardEvents();
    }
  }, [selectedMidiInput, inputEventMappings]);

  let midiInitialized = false;
  let keyboardInitialized = false;

  const setupMidiEvents = (
    refreshSettings: boolean = false,
    midiDeviceName?: string
  ) => {
    if (midiInitialized && !refreshSettings) return;

    WebMidi.enable().then(
      () => {
        // midi available
        console.log("WebMidi enabled.");

        midiInitialized = true;

        if (WebMidi.inputs.length > 0) {
          AppStateStore.update((s) => {
            s.midiInputs = WebMidi.inputs.map((input) => {
              return {
                input: input,
                name: input.name,
                type: "midi",
              };
            });
          });

          console.debug(WebMidi.inputs);
          console.debug(WebMidi.outputs);

          if (midiDeviceName != null) {
            let input = WebMidi.inputs.find((i) => i.name == midiDeviceName);

            if (input != null) {
              console.debug("midi input mapped: " + midiDeviceName);

              // listen for midi inputs and match inputs to mapping

              //remove old listeners
              input.removeListener();

              let eventListener = (e) => {
                if (
                  lastMidiEvent != null &&
                  (lastMidiEvent as any).value == e.value
                ) {
                  console.debug("skipping duplicate midi event ");
                  return;
                } else {
                  console.debug(e);
                }

                for (let mapping of inputEventMappings) {
                  if (mapping.source.type === "midi") {
                    try {
                      if (
                        mapping.source.code == e.note?.number.toString() ||
                        mapping.source.code == e.value?.toString()
                      ) {
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
                    } catch (err) {
                      console.log("Error trying to map midi event:" + err);
                    }
                  }
                }

                // record this event in case we are learning new control messages
                AppStateStore.update((s) => {
                  s.lastMidiEvent = e;
                });
              };

              input.addListener("noteon", eventListener);
              input.addListener("pitchbend", eventListener);
              input.addListener("programchange", eventListener);
              //input.addListener("controlchange", eventListener);

              AppStateStore.update((s) => {
                s.isMidiInputAvailable = true;
              });
            } else {
              // preferred midi device not connected
              AppStateStore.update((s) => {
                s.isMidiInputAvailable = false;
              });

              console.log("midi input could not be mapped: " + midiDeviceName);
            }
          } else {
            console.log("No midi input selected, skipping midi input mappings");
          }
        } else {
          console.log("No midi inputs detected");
        }
      },
      (err) => {
        if (err) {
          console.log("WebMidi could not be enabled.", err);
          midiInitialized = false;
        }
      }
    );
  };

  const setupKeyboardEvents = () => {
    if (keyboardInitialized) return;

    keyboardInitialized = true;

    // listen for keyboard inputs and match inputs to mapping
    window.addEventListener(
      "keydown",
      (event) => {
        if (
          document.activeElement != null &&
          (document.activeElement.tagName === "INPUT" ||
            document.activeElement.tagName === "TEXTAREA")
        ) {
          // if focus is on an input UI element ignore key events
          return;
        }

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
                // key handled, cancel the default action to avoid it being handled twice
                //event.preventDefault();

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
        }
      },
      true
    );
  };

  return <div></div>;
};

export default InputEventsControl;
