import React, { useEffect } from "react";
import { Utils } from "../../core/utils";
import { WebMidi } from "webmidi";
import { InputEventMapping } from "../../spork/src/interfaces/inputEventMapping";
import { AppStateStore } from "../../stores/appstate";
import { appViewModel, deviceViewModel } from "../app";
import { midiMappingController } from "../../core/midiMappingController";
import { isTypingEvent } from "./desk/keyboard-targets";

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

// Keys pressed in a popover or dialog (Save to Amp, the model browser, shortcut help,
// a modal) belong to it: a digit there picks a save slot and must not switch the amp
// away from the tone being saved.
const OWNED_KEYS_SELECTOR = '[role="dialog"], [role="alertdialog"], .amp-desk-save, .amp-desk-browser';

const isInsidePopover = (target: EventTarget | Element | null | undefined) => {
  const el = target as Element | null;
  return !!el && typeof (el as any).closest == "function" && el.closest(OWNED_KEYS_SELECTOR) != null;
};

/**
 * Capture-phase keydown listener for keyboard -> amp channel mappings. Runs before
 * any component handler, so it has to skip keys that belong to something else.
 */
export const keyboardChannelListener = (event: KeyboardEvent) => {
  if (isTypingEvent(event)) {
    // typing in a field (search box, select, typed knob value...): not a shortcut
    return;
  }

  if (isInsidePopover(event.target) || isInsidePopover(document.activeElement)) {
    return;
  }

  if (event.defaultPrevented) {
    return; // Do nothing if the event was already processed
  }

  if (event.repeat) {
    return; // discard repeated key events
  }

  const state = AppStateStore.getRawState();
  const inputEventMappings: InputEventMapping[] = state.inputEventMappings;
  const numPresetSlots: number = state.numPresetSlots;
  if (inputEventMappings == null || inputEventMappings.length == 0) return;

  for (const mapping of inputEventMappings) {
    if (mapping.source.type !== "keyboard" || mapping.target.type !== "amp-channel") continue;
    if (mapping.source.code != event.key) continue;

    // the default mappings cover keys 1-8; a 4-slot amp has no channels 5-8
    const channel = parseInt(mapping.target.value);
    if (!Number.isInteger(channel) || channel < 0 || channel >= numPresetSlots) continue;

    deviceViewModel.setChannel(channel).then(() => {
      console.log("Keyboard input event channel selection:" + mapping.target.value);
    });
  }
};

const InputEventsControl = () => {
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

  // keyboard -> channel mappings (the listener reads the current mappings itself)
  useEffect(() => {
    window.addEventListener("keydown", keyboardChannelListener, true);
    return () => window.removeEventListener("keydown", keyboardChannelListener, true);
  }, []);

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

  return <div></div>;
};

export default InputEventsControl;
