import React, { useEffect } from "react";
import { Utils } from "../../core/utils";
import { WebMidi } from "webmidi";
import { InputEventMapping } from "../../spork/src/interfaces/inputEventMapping";
import { AppStateStore } from "../../stores/appstate";
import { appViewModel, deviceViewModel } from "../app";
import { midiMappingController } from "../../core/midiMappingController";

const MIDI_EVENTS = ["noteon", "noteoff", "pitchbend", "programchange", "controlchange"] as const;

// inputs we are currently listening to, so listeners can be removed again
const attachedInputs = new Set<any>();

const midiEventListener = (e) => {
  console.debug(e);

  // matching, rate limiting and duplicate suppression happen in the mapping controller
  midiMappingController.handleMidiEvent(e);

  // record this event in case we are learning new control messages in the settings
  // mapping table, which only understands notes and program changes (CC learn is
  // handled by the MIDI mapping panel). Skipping CC also avoids a store update per
  // message while a pedal is being swept.
  if (e.type == "noteon" || e.type == "programchange") {
    AppStateStore.update((s) => {
      s.lastMidiEvent = e;
    });
  }
};

const InputEventsControl = () => {
  const inputEventMappings: InputEventMapping[] = AppStateStore.useState(
    (s) => s.inputEventMappings
  );

  const selectedMidiInput: string = AppStateStore.useState(
    (s) => s.selectedMidiInput
  );

  const midiListenAllInputs: boolean = AppStateStore.useState(
    (s) => s.midiListenAllInputs
  );

  // one time midi setup
  useEffect(() => {
    midiMappingController.attach(deviceViewModel, () => appViewModel.saveSettings());
    // initMidi is async: once unmounted it must not add listeners after this cleanup ran
    let disposed = false;
    initMidi(() => disposed).catch(console.error);

    return () => {
      disposed = true;
      WebMidi.removeListener("connected", onMidiPortsChanged);
      WebMidi.removeListener("disconnected", onMidiPortsChanged);
      detachAllInputs();
    };
  }, []);

  // when the selected midi input changes, update which inputs we listen to
  useEffect(() => {
    setupMidiEvents();
  }, [selectedMidiInput, midiListenAllInputs]);

  useEffect(() => {
    if (inputEventMappings != null && inputEventMappings.length > 0) {
      setupKeyboardEvents();
    }
  }, [inputEventMappings]);

  const refreshMidiInputList = () => {
    AppStateStore.update((s) => {
      s.midiInputs = WebMidi.inputs.map((input) => {
        return {
          input: input,
          name: input.name,
          type: "midi",
        };
      });
    });
  };

  const onMidiPortsChanged = (e) => {
    if (e?.port?.type != null && e.port.type != "input") return;

    console.log("MIDI input " + e?.type + ": " + e?.port?.name);
    refreshMidiInputList();
    setupMidiEvents();
  };

  const initMidi = async (isDisposed: () => boolean) => {
    console.log("Setting up WebMidi.");

    try {

      navigator.requestMIDIAccess().catch(console.error)

      await WebMidi.enable();
      if (isDisposed()) return;

      refreshMidiInputList();

      console.debug(WebMidi.inputs);
      console.debug(WebMidi.outputs);

      // hot-plug: keep the input list and listeners in step with connected devices
      WebMidi.addListener("connected", onMidiPortsChanged);
      WebMidi.addListener("disconnected", onMidiPortsChanged);

      console.log("WebMidi enabled.");

      Utils.sleepAsync(1000).then(() => {
        if (isDisposed()) return;
        if (AppStateStore.getRawState().selectedMidiInput != null) {
          console.log(
            "Selecting input " + AppStateStore.getRawState().selectedMidiInput
          );
        } else {
          console.log("No selected input" + selectedMidiInput);
        }
        // preferred input (or all inputs) may exist now, set that up
        setupMidiEvents();
      });
    } catch (err) {
      console.log("Web Midi unavailable:" + err);
    }
  };

  const detachAllInputs = () => {
    for (const input of attachedInputs) {
      for (const evt of MIDI_EVENTS) {
        try {
          input.removeListener(evt, midiEventListener);
        } catch {
          // input may have gone away
        }
      }
    }
    attachedInputs.clear();
  };

  const setupMidiEvents = () => {
    if (!WebMidi.enabled) {
      console.log("Midi/input events changed but midi not yet available");
      return;
    }

    const state = AppStateStore.getRawState();
    const midiDeviceName: string = state.selectedMidiInput;
    const listenAll: boolean = state.midiListenAllInputs == true;

    console.log("Midi/input events changed : " + (listenAll ? "all inputs" : midiDeviceName));

    //remove old listeners
    detachAllInputs();

    const inputs = WebMidi.inputs.filter(
      (i) => listenAll || (midiDeviceName != null && i.name == midiDeviceName)
    );

    // listen for midi inputs and match inputs to mapping
    for (const input of inputs) {
      for (const evt of MIDI_EVENTS) {
        input.addListener(evt, midiEventListener);
      }
      attachedInputs.add(input);
      console.debug("midi input mapped: " + input.name);
    }

    AppStateStore.update((s) => {
      s.isMidiInputAvailable = inputs.length > 0;
    });

    if (inputs.length == 0) {
      if (midiDeviceName != null) {
        // preferred midi device not connected
        console.log("midi input could not be mapped: " + midiDeviceName);
      } else {
        console.log("No midi input selected, skipping midi input mappings");
      }
    }
  };

  const keyboardInitialized = React.useRef(false);

  const setupKeyboardEvents = () => {
    if (keyboardInitialized.current) return;

    keyboardInitialized.current = true;

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

        // read the current mappings, this listener outlives the render it was added in
        const inputEventMappings: InputEventMapping[] =
          AppStateStore.getRawState().inputEventMappings;

        if (inputEventMappings != null && inputEventMappings.length > 0) {
          for (let mapping of inputEventMappings) {
            if (mapping.source.type === "keyboard" && mapping.target.type === "amp-channel") {
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
