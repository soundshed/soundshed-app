import React from "react";

// One-row header of the amp screen: device, channel selector, tone name and the
// tone/amp actions. Popovers (save picker, shortcut help) are passed in and drop
// down under their buttons; the tuner and mixer open as drawers below the bar.

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
  /** The experimental amp mixer drawer */
  mixerOpen: boolean;
  onToggleMixer: () => void;
  helpOpen: boolean;
  onToggleHelp: () => void;
  helpPopover?: React.ReactNode;
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

      <div className="amp-desk-topbar__tone" title={toneName ?? ""}>
        <span className="amp-desk-topbar__tone-name" data-testid="tone-name">
          {toneName || "No tone loaded"}
        </span>
        {notice && (
          <span
            className={`amp-desk-notice amp-desk-notice--${notice.kind}`}
            role={notice.kind == "error" ? "alert" : "status"}
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
        <button
          type="button"
          className={`amp-desk-action ${props.mixerOpen ? "is-active" : ""}`}
          aria-expanded={props.mixerOpen}
          aria-controls="amp-desk-mixer"
          onClick={props.onToggleMixer}
          title="Amp mixer: Guitar, Music and Master volume (experimental)"
        >
          Mixer
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
