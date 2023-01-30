import React, { useEffect } from "react";
import { Utils } from "../../core/utils";
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

  // one time midi setup
  useEffect(() => {
    initMidi().catch(console.error);
  }, []);

  // when selected midi input or event mappings change, update event mappings
  useEffect(() => {
    if (selectedMidiInput != null) {
      setupMidiEvents(selectedMidiInput);
    }

    if (inputEventMappings != null && inputEventMappings.length > 0) {
      setupKeyboardEvents();
    }
  }, [selectedMidiInput, inputEventMappings]);

  let midiAvailable = false;
  let keyboardInitialized = false;

  const initMidi = async () => {
    console.log("Setting up WebMidi.");

    try {

      navigator.requestMIDIAccess().catch(console.error)

      await WebMidi.enable();

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

      
      }

      midiAvailable = true;
      console.log("WebMidi enabled.");

      Utils.sleepAsync(1000).then(() => {
        if (AppStateStore.getRawState().selectedMidiInput != null) {
          console.log(
            "Selecting input " + AppStateStore.getRawState().selectedMidiInput
          );
          // preferred input exists, set that up
          setupMidiEvents(AppStateStore.getRawState().selectedMidiInput);
        } else {
          console.log("No selected input" + selectedMidiInput);
        }
      });
    } catch (err) {
      console.log("Web Midi unavailable:" + err);
    }
  };

  const setupMidiEvents = (midiDeviceName?: string) => {
    if (midiAvailable) {
      console.log("Midi/input events changed : " + midiDeviceName);
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
          input.addListener("controlchange", eventListener);

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
      console.log(
        "Midi/input events changed but midi not yet available : " +
          midiDeviceName
      );
    }
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
