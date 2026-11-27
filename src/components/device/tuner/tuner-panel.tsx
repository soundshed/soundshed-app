import React from "react";
import {
  describeTunerReading,
  getTunerViewModel,
  IN_TUNE_TOLERANCE_CENTS,
  MAX_OFFSET_CENTS,
  TunerViewModel,
} from "../../../core/tunerViewModel";
import { DeviceStateStore } from "../../../stores/devicestate";
import { TunerStateStore } from "../../../stores/tunerstate";

// Styled with the app's existing classes (control-strip, btn) and CSS variables
// only, so the tuner does not depend on any global stylesheet changes.

const meterStyle: React.CSSProperties = {
  position: "relative",
  flex: "1 1 180px",
  minWidth: 120,
  maxWidth: 360,
  height: 18,
  borderRadius: 4,
  border: "1px solid var(--border)",
  background: "var(--bg-elevated)",
  overflow: "hidden",
};

const inTuneZoneWidth = (IN_TUNE_TOLERANCE_CENTS / MAX_OFFSET_CENTS) * 50;

interface TunerPanelProps {
  /** Injected in tests; the app uses the shared view model. */
  viewModel?: TunerViewModel;
}

const TunerPanel = ({ viewModel }: TunerPanelProps) => {
  const vm = viewModel ?? getTunerViewModel();

  const connected: boolean = DeviceStateStore.useState((s) => s.isConnected);
  const isEnabled = TunerStateStore.useState((s) => s.isEnabled);
  const isPending = TunerStateStore.useState((s) => s.isPending);
  const note = TunerStateStore.useState((s) => s.note);
  const offset = TunerStateStore.useState((s) => s.offset);
  const error = TunerStateStore.useState((s) => s.error);

  // Resetting after a disconnect is done by TunerViewModel, since this panel is
  // unmounted while no amp is connected.

  const reading = describeTunerReading(note, offset);

  const indicatorColour = reading.inTune
    ? "var(--green)"
    : reading.direction
    ? "var(--accent)"
    : "var(--text-muted)";

  let statusText = "No note";
  if (reading.direction == "in-tune") statusText = "In tune";
  else if (reading.direction == "flat") statusText = "Flat";
  else if (reading.direction == "sharp") statusText = "Sharp";

  return (
    <div className="control-strip" role="group" aria-labelledby="tuner-label" data-testid="tuner-panel">
      <span id="tuner-label" className="control-strip-label">
        Tuner
      </span>

      <button
        type="button"
        className={isEnabled ? "btn btn-sm btn-secondary active" : "btn btn-sm btn-secondary"}
        aria-pressed={isEnabled}
        disabled={!connected || isPending}
        title={connected ? "Switch the amp's tuner on or off" : "Connect to an amp to use the tuner"}
        onClick={() => {
          void vm.toggle();
        }}
      >
        {isEnabled ? "Tuner On" : "Tuner Off"}
      </button>

      {error && (
        <span role="alert" data-testid="tuner-error" style={{ fontSize: "0.78rem", color: "var(--red)" }}>
          {error}
        </span>
      )}

      {isEnabled && (
        <>
          <span
            aria-label="Detected note"
            data-testid="tuner-note"
            style={{
              fontFamily: "var(--font-digital)",
              fontSize: "1.6rem",
              lineHeight: 1,
              minWidth: "2.2em",
              textAlign: "center",
              color: reading.inTune ? "var(--green)" : "var(--text)",
            }}
          >
            {reading.noteName ?? "–"}
          </span>

          <div
            role="meter"
            aria-label="Tuning offset in cents"
            aria-valuemin={-MAX_OFFSET_CENTS}
            aria-valuemax={MAX_OFFSET_CENTS}
            aria-valuenow={reading.cents ?? 0}
            aria-valuetext={reading.cents == null ? "No note" : `${reading.centsLabel} cents`}
            style={meterStyle}
          >
            {/* in-tune window */}
            <div
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: `${50 - inTuneZoneWidth}%`,
                width: `${inTuneZoneWidth * 2}%`,
                background: "var(--green-glow)",
              }}
            />
            {/* centre mark */}
            <div
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: "50%",
                width: 1,
                background: "var(--border-hover)",
              }}
            />
            {reading.cents != null && (
              <div
                data-testid="tuner-needle"
                style={{
                  position: "absolute",
                  top: 0,
                  bottom: 0,
                  left: `calc(${reading.needlePercent}% - 2px)`,
                  width: 4,
                  borderRadius: 2,
                  background: indicatorColour,
                  boxShadow: reading.inTune ? "0 0 8px var(--green-glow)" : "none",
                  transition: "left 80ms linear",
                }}
              />
            )}
          </div>

          <span
            data-testid="tuner-cents"
            style={{ fontVariantNumeric: "tabular-nums", minWidth: "3.5em", color: "var(--text-muted)", fontSize: "0.78rem" }}
          >
            {reading.cents == null ? "" : `${reading.centsLabel} ¢`}
          </span>

          <span
            data-testid="tuner-status"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.78rem", color: indicatorColour }}
          >
            <span
              aria-hidden="true"
              style={{
                display: "inline-block",
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: reading.inTune ? "var(--green)" : "transparent",
                border: `1px solid ${indicatorColour}`,
              }}
            />
            {statusText}
          </span>
        </>
      )}
    </div>
  );
};

export default TunerPanel;
