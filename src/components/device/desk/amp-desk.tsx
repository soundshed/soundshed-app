import React from "react";
import { VIRTUAL_CHANNEL } from "../../../core/sparkChannels";
import { isSpark2DeviceName } from "../../../core/sparkModels";
import { getTunerViewModel } from "../../../core/tunerViewModel";
import { FxCatalogProvider } from "../../../spork/src/devices/spark/sparkFxCatalog";
import { FxCatalog } from "../../../spork/src/interfaces/preset";
import { AppStateStore } from "../../../stores/appstate";
import { DeviceStateStore } from "../../../stores/devicestate";
import { TunerStateStore } from "../../../stores/tunerstate";
import { deviceViewModel } from "../../app";
import ToneChooserModal from "../../soundshed/tone-chooser-modal";
import MixerPanel from "../mixer/mixer-panel";
import TunerPanel from "../tuner/tuner-panel";
import { KnobChangePhase } from "./amp-knob";
import ChainStrip, { tabIdFor } from "./chain-strip";
import { AMP_SLOT_INDEX, buildDeskBlocks, DeskBlock, DESK_SLOTS, hasSignalChain } from "./desk-model";
import Inspector from "./inspector";
import { isTypingEvent } from "./keyboard-targets";
import ModelBrowser from "./model-browser";
import SaveSlotPicker from "./save-slot-picker";
import ShortcutsHelp from "./shortcuts-help";
import TopBar, { DeskNotice } from "./top-bar";

// Desktop amp screen: top bar (with tuner and experimental mixer drawers), the
// seven-block chain and an inspector for the selected block (with the model browser
// over it).
// Talks to the amp only through the callbacks device-main passes in.

export interface FxParamChangeArgs {
  dspId: string;
  index: number;
  value: number;
}

export interface FxToggleArgs {
  dspId: string;
  value: string;
  type: "toggle";
}

export interface AmpDeskProps {
  onRefresh: () => void;
  onSetChannel: (channel: number) => void;
  /** Stores the current tone on a hardware slot (0-based); false when it failed. */
  onSaveToAmp: (slot: number) => Promise<boolean>;
  onStoreFavourite: () => Promise<boolean | void> | void;
  onFxParamChange: (args: FxParamChangeArgs) => void;
  onFxToggle: (args: FxToggleArgs) => void;
  /** false when the amp could not switch model (removed model, not connected) */
  onFxChange: (args: { dspIdOld: string; dspIdNew: string }) => Promise<boolean>;
}

const NOTICE_MS = 4000;

const isHardwareChannel = (channel: number, numSlots: number) =>
  Number.isInteger(channel) && channel >= 0 && channel < numSlots;

const AmpDesk = (props: AmpDeskProps) => {
  const connected: boolean = DeviceStateStore.useState((s) => s.isConnected);
  const connectedDevice = DeviceStateStore.useState((s) => s.connectedDevice);
  const selectedChannel: number = DeviceStateStore.useState((s) => s.selectedChannel);
  const lastHardwareChannel: number | null = DeviceStateStore.useState((s) => s.lastHardwareChannel);
  const tone = DeviceStateStore.useState((s) => s.presetTone);
  const storeCatalog: FxCatalog | null = DeviceStateStore.useState((s) => s.fxCatalog);
  const numSlots: number = AppStateStore.useState((s) => s.numPresetSlots);
  const tunerEnabled = TunerStateStore.useState((s) => s.isEnabled);

  const catalog = React.useMemo(() => storeCatalog ?? FxCatalogProvider.getFxCatalog(), [storeCatalog]);
  const blocks = React.useMemo(() => buildDeskBlocks(tone, catalog), [tone, catalog]);
  const hasChain = hasSignalChain(tone);

  const [selectedIndex, setSelectedIndex] = React.useState(AMP_SLOT_INDEX);
  const [browserOpen, setBrowserOpen] = React.useState(false);
  const [saveOpen, setSaveOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [helpOpen, setHelpOpen] = React.useState(false);
  const [tunerOpen, setTunerOpen] = React.useState(false);
  const [mixerOpen, setMixerOpen] = React.useState(false);
  const [toneChooserOpen, setToneChooserOpen] = React.useState(false);
  const [notice, setNotice] = React.useState<DeskNotice | null>(null);

  const selectedBlock: DeskBlock | null = blocks[selectedIndex] ?? null;

  // Save defaults to the channel in use, or the last real one when a library tone
  // was applied to the virtual channel since (kept in the store, so it survives
  // leaving this screen).
  const saveDefaultSlot = isHardwareChannel(selectedChannel, numSlots)
    ? selectedChannel
    : lastHardwareChannel != null && isHardwareChannel(lastHardwareChannel, numSlots)
      ? lastHardwareChannel
      : 0;

  // Set synchronously so a second save can never start while one is uploading.
  const savingRef = React.useRef(false);
  const saveButtonRef = React.useRef<HTMLButtonElement>(null);
  const helpButtonRef = React.useRef<HTMLButtonElement>(null);
  // Slot the browser was last opened on by the user. It remounts per block, and only
  // a user open focuses its search: a remount from ←/→ leaves focus on the chain.
  const browserAutoFocus = React.useRef<number | null>(null);

  const noticeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const showNotice = (n: DeskNotice) => {
    setNotice(n);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), NOTICE_MS);
  };
  React.useEffect(() => () => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
  }, []);

  // ---- actions

  const focusSelectedTab = (index = selectedIndex) => {
    // after the browser unmounts, so focus doesn't fall back to <body>
    setTimeout(() => document.getElementById(tabIdFor(index))?.focus(), 0);
  };

  const selectBlock = (index: number) => {
    browserAutoFocus.current = null;
    setSelectedIndex(Math.min(DESK_SLOTS.length - 1, Math.max(0, index)));
  };

  // When a popover closes with focus inside it (or already lost to <body>), hand
  // focus back to the button that opened it.
  const returnFocus = (trigger: HTMLButtonElement | null, popover: string) => {
    const active = document.activeElement as HTMLElement | null;
    if (!trigger || trigger.disabled) return;
    if (!active || active == document.body || active.closest?.(popover)) trigger.focus();
  };

  // A running save keeps the picker open, so its result is always shown; false then.
  const closeSave = (restoreFocus: boolean) => {
    if (savingRef.current) return false;
    if (saveOpen && restoreFocus) returnFocus(saveButtonRef.current, ".amp-desk-save");
    setSaveOpen(false);
    return true;
  };

  const closeHelp = (restoreFocus: boolean) => {
    if (helpOpen && restoreFocus) returnFocus(helpButtonRef.current, ".amp-desk-help");
    setHelpOpen(false);
  };

  const openSave = () => {
    if (!connected) {
      showNotice({ kind: "error", text: "Connect an amp to save the tone to it." });
      return;
    }
    closeHelp(false);
    setBrowserOpen(false);
    setSaveOpen(true);
  };

  const toggleHelp = () => {
    if (helpOpen) closeHelp(true);
    else if (closeSave(false)) setHelpOpen(true);
  };

  const openBrowser = (index = selectedIndex) => {
    if (blocks[index]?.fx == null) return;
    closeSave(false);
    closeHelp(false);
    browserAutoFocus.current = index;
    setSelectedIndex(index);
    setBrowserOpen(true);
  };

  const closeBrowser = () => {
    setBrowserOpen(false);
    focusSelectedTab();
  };

  const toggleBlock = (block: DeskBlock | null) => {
    if (!block?.fx) return;
    props.onFxToggle({ dspId: block.fx.type, value: block.fx.enabled == true ? "0" : "1", type: "toggle" });
  };

  const changeParam = (block: DeskBlock, index: number, value: number, _phase: KnobChangePhase) => {
    if (!block.fx) return;
    // Both phases go through the view model's per-param coalescing, which always sends
    // the latest value once the previous send settles, so a release needs no separate path.
    props.onFxParamChange({ dspId: block.fx.type, index, value });
  };

  const applyModel = async (dspIdNew: string) => {
    if (!selectedBlock?.fx) return false;
    return props.onFxChange({ dspIdOld: selectedBlock.fx.type, dspIdNew });
  };

  const saveToAmp = async (slot: number) => {
    if (savingRef.current) return false;
    savingRef.current = true;
    setSaving(true);
    try {
      return await props.onSaveToAmp(slot);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const storeFavourite = async () => {
    try {
      const result = await props.onStoreFavourite();
      if (result === false) showNotice({ kind: "error", text: "Couldn't save this tone as a favourite." });
      else showNotice({ kind: "ok", text: "Saved to favourites." });
    } catch {
      showNotice({ kind: "error", text: "Couldn't save this tone as a favourite." });
    }
  };

  const tunerVisible = tunerOpen || tunerEnabled;
  const toggleTuner = () => {
    if (tunerVisible) {
      // The amp is muted while its tuner runs, so hiding the tuner also switches it off.
      if (TunerStateStore.getRawState().isEnabled && !TunerStateStore.getRawState().isPending) {
        void getTunerViewModel().setEnabled(false);
      }
      setTunerOpen(false);
    } else {
      setTunerOpen(true);
    }
  };

  // Closes the topmost popover; false when nothing was open.
  const closeTopPopover = () => {
    if (helpOpen) closeHelp(true);
    else if (saveOpen) closeSave(true); // a running save stays open, Esc is still used up
    else if (browserOpen) closeBrowser();
    else return false;
    return true;
  };

  // ---- keyboard shortcuts (window level, so they work wherever focus is on the page)

  const handlerRef = React.useRef<(e: KeyboardEvent) => void>(() => {});
  handlerRef.current = (e: KeyboardEvent) => {
    if (e.defaultPrevented || toneChooserOpen) return;

    if (e.key == "Escape") {
      if (closeTopPopover()) e.preventDefault();
      return;
    }

    if (isTypingEvent(e)) return;

    const mod = e.metaKey || e.ctrlKey;
    const key = e.key.length == 1 ? e.key.toLowerCase() : e.key;

    if (mod && !e.altKey && key == "s") {
      e.preventDefault();
      openSave();
      return;
    }
    if (mod && !e.altKey && key == "f") {
      e.preventDefault();
      openBrowser();
      return;
    }
    if (mod || e.altKey) return;

    switch (key) {
      case "?":
        e.preventDefault();
        toggleHelp();
        return;
      case "/":
      case "m":
        e.preventDefault();
        openBrowser();
        return;
      case "ArrowLeft":
      case "[":
        if (saveOpen || helpOpen) return;
        e.preventDefault();
        selectBlock(selectedIndex - 1);
        return;
      case "ArrowRight":
      case "]":
        if (saveOpen || helpOpen) return;
        e.preventDefault();
        selectBlock(selectedIndex + 1);
        return;
      case " ": {
        // Only when the chain or the inspector has focus, and never on a control whose
        // own Space action (a button press) would then run as well.
        const active = document.activeElement as HTMLElement | null;
        if (!active?.closest?.('[data-desk-region="chain"], [data-desk-region="inspector"]')) return;
        if (active.closest('button, a, input, select, textarea, [role="dialog"]')) return;
        e.preventDefault();
        toggleBlock(selectedBlock);
        return;
      }
    }
  };

  React.useEffect(() => {
    const listener = (e: KeyboardEvent) => handlerRef.current(e);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  // A click outside the save picker or the help closes them.
  React.useEffect(() => {
    if (!saveOpen && !helpOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (target?.closest?.(".amp-desk-anchor")) return;
      closeSave(false);
      closeHelp(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [saveOpen, helpOpen]);

  // The mixer drawer picks its Spark 2 defaults from this; the device manager knows a
  // Spark 2 even when its name does not say so.
  const deviceManager = (deviceViewModel as any)?.deviceContext?.deviceManager ?? null;
  const isSpark2 = connected && (!!deviceManager?.isSpark2Device?.() || isSpark2DeviceName(connectedDevice?.name));

  return (
    <div className="amp-desk">
      <TopBar
        deviceName={connectedDevice?.name ?? null}
        connected={connected}
        numSlots={numSlots}
        selectedChannel={selectedChannel}
        isLive={selectedChannel == VIRTUAL_CHANNEL}
        toneName={tone?.name ?? null}
        onSetChannel={props.onSetChannel}
        onRefresh={props.onRefresh}
        saveOpen={saveOpen}
        saveDisabled={!connected || saving}
        saveButtonRef={saveButtonRef}
        onToggleSave={() => (saveOpen ? closeSave(true) : openSave())}
        savePopover={
          <SaveSlotPicker
            numSlots={numSlots}
            defaultSlot={saveDefaultSlot}
            toneName={tone?.name || "current tone"}
            onSave={saveToAmp}
            onClose={() => closeSave(true)}
          />
        }
        onFavourite={() => void storeFavourite()}
        onBrowseTones={() => setToneChooserOpen(true)}
        tunerOpen={tunerVisible}
        onToggleTuner={toggleTuner}
        mixerOpen={mixerOpen}
        onToggleMixer={() => setMixerOpen((o) => !o)}
        helpOpen={helpOpen}
        helpButtonRef={helpButtonRef}
        onToggleHelp={toggleHelp}
        helpPopover={<ShortcutsHelp onClose={() => closeHelp(true)} />}
        notice={notice}
      />

      {tunerVisible && (
        <div id="amp-desk-tuner" className="amp-desk-drawer">
          <TunerPanel />
        </div>
      )}

      {mixerOpen && (
        <div id="amp-desk-mixer" className="amp-desk-drawer amp-desk-drawer--mixer">
          <MixerPanel isSpark2={isSpark2} />
        </div>
      )}

      {hasChain ? (
        <>
          <ChainStrip
            blocks={blocks}
            selectedIndex={selectedIndex}
            onSelect={selectBlock}
            onToggle={toggleBlock}
            onOpenBrowser={openBrowser}
          />
          <Inspector
            block={selectedBlock}
            onParamChange={changeParam}
            onToggle={toggleBlock}
            onOpenBrowser={() => openBrowser()}
          >
            {browserOpen && selectedBlock?.fx && (
              <ModelBrowser
                key={selectedBlock.slotIndex}
                autoFocusSearch={browserAutoFocus.current == selectedBlock.slotIndex}
                block={selectedBlock}
                catalog={catalog}
                onApply={applyModel}
                onClose={closeBrowser}
              />
            )}
          </Inspector>
        </>
      ) : (
        <div className="amp-desk-nopreset info">
          <p>
            No preset selected — amp may not be connected. Connect and refresh to load current amp settings. You may
            need to select a preset on the amp first.
          </p>
        </div>
      )}

      <ToneChooserModal show={toneChooserOpen} onClose={() => setToneChooserOpen(false)} />
    </div>
  );
};

export default AmpDesk;
