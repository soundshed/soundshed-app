import { faVolumeHigh } from "@fortawesome/free-solid-svg-icons/faVolumeHigh";
import { faVolumeXmark } from "@fortawesome/free-solid-svg-icons/faVolumeXmark";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import React from "react";
import { formatMixerValue, getMixerViewModel, MIXER_CHANNELS, MixerViewModel } from "../../../core/mixerViewModel";
import { DeviceStateStore } from "../../../stores/devicestate";
import { IMixerChannelState, MixerStateStore } from "../../../stores/mixerstate";
import AmpKnob, { KnobChangePhase } from "../desk/amp-knob";

// Guitar / Music volume knobs and mute buttons at the right end of the nav bar, on
// every page. Rendered only while an amp is connected; nothing at all otherwise.
// They share MixerStateStore with the amp screen's mixer drawer, so both stay in sync.

export const NAV_KNOB_SIZE = 30;

/**
 * Drag distance for a full sweep of a nav knob. The knob sits at the top of the
 * window, so there is little room to drag up: right counts too, and the range is
 * half the amp desk's.
 */
export const NAV_KNOB_DRAG_RANGE_PX = 100;

const SEND_FAILED_HINT = "the last change did not reach the amp, try again";

interface NavMixerChannelProps {
  vm: MixerViewModel;
  channel: number;
  label: string;
  state: IMixerChannelState | undefined;
}

const NavMixerChannel = ({ vm, channel, label, state }: NavMixerChannelProps) => {
  const muted = !!state?.muted;
  const failed = !!state?.sendFailed;
  // While muted the knob shows the level unmuting goes back to, dimmed.
  const level = muted ? state?.unmuteValue ?? null : state?.value ?? null;
  const unknown = level == null;

  // A gesture's commit usually repeats its last live value; don't send that twice.
  const lastLive = React.useRef<number | null>(null);

  const onChange = (value: number, phase: KnobChangePhase) => {
    // The knob commits an unfinished gesture when it unmounts (on a disconnect).
    if (!DeviceStateStore.getRawState().isConnected) return;
    if (phase == "commit") {
      const repeat = lastLive.current === value;
      lastLive.current = null;
      if (repeat) return;
    } else {
      lastLive.current = value;
    }
    // Live values go out too: the view model keeps one send in flight per channel.
    void vm.setVolume(channel, value);
  };

  const formatValue = (value: number) =>
    unknown ? "unknown" : `${Math.round(value * 100)} %${muted ? " (muted)" : ""}`;

  const name = label.toLowerCase();

  const classes = ["nav-mixer__channel"];
  if (muted) classes.push("is-muted");
  if (failed) classes.push("is-error");

  const muteTitle = muted ? `${label} muted: click to restore its level` : `Mute ${name} (sets its level to 0)`;

  return (
    <div
      className={classes.join(" ")}
      data-testid={`nav-mixer-${channel}`}
      title={`${label} ${formatMixerValue(level)}${muted ? " (muted)" : ""}${failed ? `: ${SEND_FAILED_HINT}` : ""}`}
    >
      <AmpKnob
        compact
        horizontalDrag
        dragRange={NAV_KNOB_DRAG_RANGE_PX}
        size={NAV_KNOB_SIZE}
        label={`${label} volume`}
        value={level ?? 0}
        endValue={null}
        formatValue={formatValue}
        className="nav-mixer__knob"
        onChange={onChange}
      />
      <span className="nav-mixer__text">
        <span className="nav-mixer__label">{label}</span>
        <span className="nav-mixer__value" data-testid={`nav-mixer-value-${channel}`}>
          {formatMixerValue(level)}
        </span>
      </span>
      <button
        type="button"
        className={`nav-mixer__mute${muted ? " is-muted" : ""}`}
        aria-pressed={muted}
        aria-label={`Mute ${name}`}
        title={failed ? `${muteTitle}. ${label}: ${SEND_FAILED_HINT}.` : muteTitle}
        onClick={() => void vm.toggleMute(channel)}
      >
        <FontAwesomeIcon icon={muted ? faVolumeXmark : faVolumeHigh} aria-hidden="true" />
      </button>
      {/* always rendered, so screen readers announce the text when it appears */}
      <span className="visually-hidden" role="status" data-testid={`nav-mixer-error-${channel}`}>
        {failed ? `${label}: ${SEND_FAILED_HINT}` : ""}
      </span>
    </div>
  );
};

interface GlobalMixerControlsProps {
  /** Injected in tests; the app uses the shared view model. */
  viewModel?: MixerViewModel;
}

const GlobalMixerControls = ({ viewModel }: GlobalMixerControlsProps) => {
  const connected: boolean = DeviceStateStore.useState((s) => s.isConnected);
  const channels = MixerStateStore.useState((s) => s.channels);

  if (!connected) return null;

  const vm = viewModel ?? getMixerViewModel();

  return (
    <div className="nav-mixer" role="group" aria-label="Amp volume" data-testid="nav-mixer">
      {MIXER_CHANNELS.map((c) => (
        <NavMixerChannel key={c.channel} vm={vm} channel={c.channel} label={c.label} state={channels[c.channel]} />
      ))}
    </div>
  );
};

export default GlobalMixerControls;
