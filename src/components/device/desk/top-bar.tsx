import React from "react";

// One-row header of the amp screen: device, channel selector, tone name and the
// tone/amp actions. Popovers (save picker, rename, shortcut help) are passed in and
// drop down under their buttons; the tuner opens as a drawer below the bar.

export interface DeskNotice {
  text: string;
  kind: "ok" | "error";
}

interface TopBarProps {
  deviceName: string | null;
  connected: boolean;
  numSlots: number;
  selectedChannel: number;
  isLive: boolean;
  toneName: string | null;
  onSetChannel: (channel: number) => void;
  onRefresh: () => void;
  saveOpen: boolean;
  /** Not connected, or a save is already running */
  saveDisabled: boolean;
  onToggleSave: () => void;
  /** The popover triggers, so the screen can hand focus back when a popover closes */
  saveButtonRef?: React.Ref<HTMLButtonElement>;
  helpButtonRef?: React.Ref<HTMLButtonElement>;
  savePopover?: React.ReactNode;
  onFavourite: () => void;
  onBrowseTones: () => void;
  tunerOpen: boolean;
  onToggleTuner: () => void;
  helpOpen: boolean;
  onToggleHelp: () => void;
  helpPopover?: React.ReactNode;
  renameOpen: boolean;
  /** No tone loaded, or a save or rename is already running */
  renameDisabled: boolean;
  /** Tooltip of the rename button, e.g. why it is disabled */
  renameTitle?: string;
  renameButtonRef?: React.Ref<HTMLButtonElement>;
  onToggleRename: () => void;
  renamePopover?: React.ReactNode;
  /** Last known name per hardware slot (0-based), this session only */
  slotNames?: Record<number, string>;
  notice: DeskNotice | null;
}

const TopBar = (props: TopBarProps) => {
  const {
    deviceName,
    connected,
    numSlots,
    selectedChannel,
    isLive,
    toneName,
    notice,
  } = props;
  const slotNames = props.slotNames ?? {};

  return (
    <header className="amp-desk-topbar">
      <div className="amp-desk-topbar__device" title={connected ? "Connected" : "Not connected"}>
        <span className={`status-dot ${connected ? "connected" : "disconnected"}`} aria-hidden="true" />
        <span className="amp-desk-topbar__device-name">{deviceName || "Spark"}</span>
      </div>

      <div className="amp-desk-topbar__channels">
        <span id="amp-desk-channel-label" className="amp-desk-topbar__label">
          Channel
        </span>
        <div className="amp-desk-channels" role="group" aria-labelledby="amp-desk-channel-label">
          {Array.from({ length: numSlots }, (_, i) => (
            <button
              key={i}
              type="button"
              className={`amp-desk-channel ${selectedChannel === i ? "is-active" : ""}`}
              id={`ch${i + 1}`}
              aria-label={`Channel ${i + 1}`}
              title={slotNames[i] ? `Channel ${i + 1}: ${slotNames[i]}` : `Channel ${i + 1}`}
              aria-pressed={selectedChannel === i}
              onClick={() => props.onSetChannel(i)}
            >
              {i + 1}
            </button>
          ))}
        </div>
        {isLive && (
          <span className="amp-desk-live" title="A tone applied from the library, not stored on a channel yet">
            Live
          </span>
        )}
      </div>

      {/* The rename popover opens inside this element, so the tone name's tooltip is on
          the name only: on the wrapper every field and button in the popover showed it. */}
      <div className="amp-desk-topbar__tone">
        <span className="amp-desk-topbar__tone-name" data-testid="tone-name" title={toneName ?? ""}>
          {toneName || "No tone loaded"}
        </span>
        {/* positions the rename popover from the tone area, not from the ✎ (see styles.css) */}
        <div className="amp-desk-anchor amp-desk-anchor--rename">
          <button
            ref={props.renameButtonRef}
            type="button"
            id="renamePreset"
            className={`amp-desk-action amp-desk-action--rename ${props.renameOpen ? "is-active" : ""}`}
            aria-label="Rename tone"
            title={props.renameTitle ?? "Rename (F2)"}
            aria-haspopup="dialog"
            aria-expanded={props.renameOpen}
            disabled={props.renameDisabled}
            onClick={props.onToggleRename}
          >
            ✎
          </button>
          {props.renameOpen && props.renamePopover}
        </div>
        {notice && (
          <span
            className={`amp-desk-notice amp-desk-notice--${notice.kind}`}
            role={notice.kind == "error" ? "alert" : "status"}
            title={notice.text}
          >
            {notice.text}
          </span>
        )}
      </div>

      <div className="amp-desk-topbar__actions">
        <button type="button" className="amp-desk-action" onClick={props.onRefresh} title="Refresh current preset from amp" aria-label="Refresh">
          ↺
        </button>
        <div className="amp-desk-anchor">
          <button
            ref={props.saveButtonRef}
            type="button"
            id="storePreset"
            className={`amp-desk-action ${props.saveOpen ? "is-active" : ""}`}
            aria-expanded={props.saveOpen}
            aria-haspopup="dialog"
            disabled={props.saveDisabled}
            title={
              connected
                ? "Save the current tone to a channel on the amp (Ctrl/⌘+S)"
                : "Connect an amp to save the tone to it"
            }
            onClick={props.onToggleSave}
          >
            ↓ Save to Amp
          </button>
          {props.saveOpen && props.savePopover}
        </div>
        <button type="button" className="amp-desk-action" title="Save as Favourite" onClick={props.onFavourite}>
          ★ Favourite
        </button>
        <button type="button" className="amp-desk-action" onClick={props.onBrowseTones}>
          Browse Tones
        </button>
        <button
          type="button"
          className={`amp-desk-action ${props.tunerOpen ? "is-active" : ""}`}
          aria-expanded={props.tunerOpen}
          aria-controls="amp-desk-tuner"
          onClick={props.onToggleTuner}
          title="Show the tuner"
        >
          Tuner
        </button>
        <div className="amp-desk-anchor">
          <button
            ref={props.helpButtonRef}
            type="button"
            className={`amp-desk-action amp-desk-action--icon ${props.helpOpen ? "is-active" : ""}`}
            aria-expanded={props.helpOpen}
            aria-haspopup="dialog"
            aria-label="Keyboard shortcuts"
            title="Keyboard shortcuts (?)"
            onClick={props.onToggleHelp}
          >
            ?
          </button>
          {props.helpOpen && props.helpPopover}
        </div>
      </div>
    </header>
  );
};

export default TopBar;
