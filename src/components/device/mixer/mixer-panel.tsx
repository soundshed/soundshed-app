import React from "react";
import {
  effectiveTrailingZero,
  formatMixerValue,
  getMixerViewModel,
  MIXER_CHANNELS,
  MIXER_PROBE_MAX_CHANNEL,
  mixerValueToPercent,
  MixerViewModel,
} from "../../../core/mixerViewModel";
import { DeviceStateStore } from "../../../stores/devicestate";
import { IMixerChannelState, MixerStateStore } from "../../../stores/mixerstate";

// Amp mixer diagnostics drawer (Guitar / Music sliders, reads, acks, 0x03 0x6b, the
// trailing 0x00 switch and a custom channel). Everyday control is the nav bar's
// knobs (global-mixer-controls.tsx); both share MixerStateStore so they stay in sync.
// Styled like the tuner drawer: the app's control-strip classes, btn and CSS
// variables.
//
// Nothing is sent until the user moves a slider. Opening the panel only reads.

export const MIXER_WARNING =
  "Experimental. Sends the Spark mixer message (0x33). Guitar and Music were confirmed on a Spark 2 in a user's hardware test; other models are untested. This panel is for diagnostics.";

const panelStyle: React.CSSProperties = {
  padding: "0.6rem 1rem 0.75rem",
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "0.5rem",
};

const slidersStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "0.5rem 1.25rem",
  margin: "0.5rem 0",
};

const noteStyle: React.CSSProperties = {
  margin: "0.35rem 0 0",
  fontSize: "0.78rem",
  color: "var(--text-muted)",
};

const formatTime = (at: number | null | undefined) => (at ? new Date(at).toLocaleTimeString() : "");

/** Short text for the last read of a channel. */
export function describeRead(state: IMixerChannelState | undefined): string {
  switch (state?.readStatus) {
    case "pending":
      return "reading…";
    case "ok":
      return state.readUncertain
        ? `read ${formatMixerValue(state.lastReadValue)} (may be a late reply)`
        : `read ${formatMixerValue(state.lastReadValue)}`;
    case "no-reply":
      return "no reply";
    case "error":
      return "request failed";
    default:
      return "";
  }
}

interface MixerSliderProps {
  id: string;
  label: string;
  channel: number;
  state: IMixerChannelState | undefined;
  disabled: boolean;
  /** Called with a whole percentage on every user change. */
  onChange: (percent: number) => void;
}

const MixerSlider = ({ id, label, channel, state, disabled, onChange }: MixerSliderProps) => {
  // While the user drags (or holds a key), show their value rather than what the amp
  // reports meanwhile (e.g. a 0x03 0x6b input volume notification).
  const [dragValue, setDragValue] = React.useState<number | null>(null);

  // A disconnect mid-drag disables the slider, so no keyup/pointerup/blur ever ends
  // the drag: drop it, so the unknown state and the next read value show again.
  React.useEffect(() => {
    if (disabled) setDragValue(null);
  }, [disabled]);

  const known = mixerValueToPercent(state?.value);
  const shown = dragValue ?? known;
  // Never start at a loud default: an unknown value sits at 0.
  const sliderValue = shown ?? 0;

  const change = (percent: number) => {
    const next = Math.max(0, Math.min(100, Math.round(percent)));
    setDragValue(next);
    onChange(next);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    let step = 0;
    switch (e.key) {
      case "ArrowUp":
      case "ArrowRight":
        step = 1;
        break;
      case "ArrowDown":
      case "ArrowLeft":
        step = -1;
        break;
      case "PageUp":
        step = 10;
        break;
      case "PageDown":
        step = -10;
        break;
      case "Home":
        e.preventDefault();
        change(0);
        return;
      case "End":
        // A stray End must never jump to full volume.
        e.preventDefault();
        return;
      default:
        return;
    }
    e.preventDefault();
    change(sliderValue + step);
  };

  const endDrag = () => setDragValue(null);

  const valueText = shown == null ? "unknown" : `${shown} %`;
  const readText = describeRead(state);

  return (
    <div className="amp-mixer__channel" data-testid={`mixer-channel-${channel}`}>
      <div style={{ ...rowStyle, justifyContent: "space-between" }}>
        <label htmlFor={id} className="control-strip-label" style={{ margin: 0 }}>
          {label} <span style={{ color: "var(--text-faint)" }}>ch {channel}</span>
        </label>
        <output htmlFor={id} data-testid={`mixer-value-${channel}`} style={{ fontVariantNumeric: "tabular-nums", fontSize: "0.82rem" }}>
          {shown == null ? "—" : `${shown} %`}
        </output>
      </div>
      <input
        id={id}
        type="range"
        className="form-range"
        min={0}
        max={100}
        step={1}
        value={sliderValue}
        disabled={disabled}
        aria-valuetext={valueText}
        onChange={(e) => change(Number(e.target.value))}
        onKeyDown={onKeyDown}
        onKeyUp={endDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
        onBlur={endDrag}
      />
      <div style={{ ...rowStyle, justifyContent: "space-between", fontSize: "0.72rem", color: "var(--text-muted)" }}>
        <span>{shown == null ? "unknown" : state?.muted ? "muted" : ""}</span>
        <span data-testid={`mixer-read-${channel}`}>{readText}</span>
      </div>
    </div>
  );
};

interface MixerPanelProps {
  /** Injected in tests; the app uses the shared view model. */
  viewModel?: MixerViewModel;
  /** The connected amp is a Spark 2, so the trailing 0x00 is on by default. */
  isSpark2?: boolean;
}

const MixerPanel = ({ viewModel, isSpark2 = false }: MixerPanelProps) => {
  const vm = viewModel ?? getMixerViewModel();

  const connected: boolean = DeviceStateStore.useState((s) => s.isConnected);
  const mixer = MixerStateStore.useState((s) => s);

  const [probeChannel, setProbeChannel] = React.useState(1);
  // The field's text while typing (it may be empty or out of range for a moment);
  // probeChannel only changes on a valid whole number.
  const [probeText, setProbeText] = React.useState("1");

  // Reading is harmless, so the panel asks the amp for its values when it opens (and
  // when an amp connects while it is open). It never sends a value by itself.
  React.useEffect(() => {
    if (connected) void vm.readMixer();
  }, [connected, vm]);

  const disabled = !connected;
  const trailingZero = effectiveTrailingZero(mixer.trailingZero, isSpark2);
  const probeState = mixer.channels[probeChannel];

  return (
    <section className="amp-mixer" style={panelStyle} aria-labelledby="amp-mixer-title" data-testid="mixer-panel">
      <div style={{ ...rowStyle, justifyContent: "space-between" }}>
        <h6 id="amp-mixer-title" style={{ margin: 0, color: "var(--text-muted)" }}>
          Amp mixer (experimental)
        </h6>
        <button
          type="button"
          className="btn btn-sm btn-secondary"
          disabled={disabled || mixer.isReading}
          title="Ask the amp for its Guitar and Music volume (read only)"
          onClick={() => void vm.readMixer()}
        >
          {mixer.isReading ? "Reading…" : "Read from amp"}
        </button>
      </div>

      <p role="note" style={{ ...noteStyle, color: "var(--accent)" }}>
        {MIXER_WARNING}
      </p>

      {!connected && <p style={noteStyle}>Connect an amp to use the mixer.</p>}

      <div style={slidersStyle}>
        {MIXER_CHANNELS.map((c) => (
          <MixerSlider
            key={c.channel}
            id={`amp-mixer-ch${c.channel}`}
            label={c.label}
            channel={c.channel}
            state={mixer.channels[c.channel]}
            disabled={disabled}
            onChange={(percent) => void vm.setVolume(c.channel, percent / 100)}
          />
        ))}
      </div>

      <p data-testid="mixer-status" style={noteStyle}>
        Amp acks (04 33): {mixer.ackCount}
        {mixer.lastAckAt ? `, last at ${formatTime(mixer.lastAckAt)}` : ""}
        {" · "}
        Input volume from amp (03 6B):{" "}
        {mixer.lastInputVolume == null
          ? "none yet"
          : `${formatMixerValue(mixer.lastInputVolume)} at ${formatTime(mixer.lastInputVolumeAt)}`}
      </p>

      {mixer.lastError && (
        <p role="alert" style={{ ...noteStyle, color: "var(--red)" }}>
          {mixer.lastError}
        </p>
      )}

      <details style={{ marginTop: "0.5rem" }}>
        <summary className="control-strip-label" style={{ cursor: "pointer" }}>
          Advanced
        </summary>
        <div style={{ ...rowStyle, marginTop: "0.5rem" }}>
          <label style={{ ...rowStyle, gap: "0.35rem" }}>
            <input
              type="checkbox"
              className="form-check-input"
              checked={trailingZero}
              disabled={disabled}
              onChange={(e) => vm.setTrailingZero(e.target.checked)}
            />
            <span className="control-strip-label">Append 0x00 (Spark 2 style)</span>
          </label>
          <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
            {mixer.trailingZero == null ? `default for this amp: ${isSpark2 ? "on" : "off"}` : "set by you"}
          </span>
        </div>
        <div style={{ ...rowStyle, marginTop: "0.5rem", alignItems: "flex-end" }}>
          <label style={{ ...rowStyle, gap: "0.35rem" }} htmlFor="amp-mixer-probe-channel">
            <span className="control-strip-label">Custom channel</span>
          </label>
          <input
            id="amp-mixer-probe-channel"
            type="number"
            className="form-control form-control-sm"
            style={{ width: "4.5rem" }}
            min={0}
            max={MIXER_PROBE_MAX_CHANNEL}
            step={1}
            value={probeText}
            disabled={disabled}
            onChange={(e) => {
              const text = e.target.value;
              setProbeText(text);
              const n = Number(text);
              if (text.trim() != "" && Number.isInteger(n) && n >= 0 && n <= MIXER_PROBE_MAX_CHANNEL) setProbeChannel(n);
            }}
            onBlur={() => setProbeText(String(probeChannel))}
          />
          <div style={{ flex: "1 1 220px" }}>
            <MixerSlider
              key={probeChannel}
              id="amp-mixer-probe"
              label="Custom"
              channel={probeChannel}
              state={probeState}
              disabled={disabled}
              onChange={(percent) => void vm.setVolume(probeChannel, percent / 100)}
            />
          </div>
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            disabled={disabled || mixer.isReading}
            onClick={() => void vm.readMixer([probeChannel])}
          >
            Read ch {probeChannel}
          </button>
        </div>
      </details>
    </section>
  );
};

export default MixerPanel;
