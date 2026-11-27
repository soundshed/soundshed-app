import React from "react";
import {
  getLooperButtonLabels,
  getLooperStatusText,
  getLooperSupport,
  LOOPER_BARS_OPTIONS,
  looperViewModel,
  measureToPosition,
} from "../../../core/looperViewModel";
import {
  DEFAULT_LOOPER_SETTINGS,
  LOOPER_COUNT_SHUFFLE,
  LOOPER_COUNT_STRAIGHT,
  LOOPER_MAX_BPM,
  LOOPER_MIN_BPM,
  LooperSettings,
} from "../../../spork/src/devices/spark/sparkLooper";
import { DeviceStateStore } from "../../../stores/devicestate";
import { LooperStateStore } from "../../../stores/looperstate";
import { deviceViewModel } from "../../app";

const FREE_BARS = "free";

const panelStyle: React.CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  padding: "0.75rem 1rem",
  margin: "1rem 0",
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "0.5rem",
};

const fieldStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.35rem",
};

const getDeviceManager = () => deviceViewModel?.deviceContext?.deviceManager ?? null;

const LooperPanel = () => {
  const isConnected: boolean = DeviceStateStore.useState((s) => s.isConnected);
  const connectedDevice = DeviceStateStore.useState((s) => s.connectedDevice);
  const looper = LooperStateStore.useState((s) => s);

  const deviceManager = getDeviceManager();
  const support = getLooperSupport(
    isConnected,
    connectedDevice?.name,
    !!deviceManager?.isSpark2Device?.()
  );
  const enabled = support === "spark2" || support === "unknown";

  const [busy, setBusy] = React.useState(false);
  const [form, setForm] = React.useState<LooperSettings>(
    looper.settings ?? DEFAULT_LOOPER_SETTINGS
  );
  // true while the form holds edits that were not applied yet
  const [dirty, setDirty] = React.useState(false);

  React.useEffect(() => {
    looperViewModel.attach(getDeviceManager());
  }, []);

  // Transport state is reset by the view model itself when the amp disconnects.
  React.useEffect(() => {
    if (enabled) {
      void looperViewModel.refresh();
    }
  }, [support]);

  // Follow the amp's settings, but never overwrite edits the user has not applied
  // (transport actions refresh the settings from the amp).
  React.useEffect(() => {
    if (!dirty && looper.settings) setForm(looper.settings);
  }, [looper.settings, dirty]);

  if (support === "disconnected" || support === "other") {
    return (
      <div className="looper-panel" style={panelStyle}>
        <h6 style={{ margin: 0, color: "var(--text-muted)" }}>Looper</h6>
        <p style={{ margin: "0.25rem 0 0", color: "var(--text-muted)", fontSize: "0.85rem" }}>
          {support === "disconnected"
            ? "Connect a Spark 2 to use its built-in looper."
            : "The looper is only available on Spark 2."}
        </p>
      </div>
    );
  }

  const run = async (action: () => Promise<boolean>) => {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  };

  const labels = getLooperButtonLabels(looper);
  const bars = looper.settings && !looper.settings.free ? looper.settings.bars : null;
  const position = measureToPosition(looper.measure, bars);
  const progress =
    looper.measure != null && Number.isFinite(looper.measure)
      ? Math.min(Math.max(looper.measure, 0), 1)
      : 0;
  const canPlay = looper.hasLoop || looper.isPlaying || looper.isRecording || looper.isCountingIn;

  const setField = (patch: Partial<LooperSettings>) => {
    setDirty(true);
    setForm((f) => ({ ...f, ...patch }));
  };

  const revertForm = () => {
    setDirty(false);
    setForm(looper.settings ?? DEFAULT_LOOPER_SETTINGS);
  };

  const ampSettingsDiffer =
    dirty && looper.settings != null && JSON.stringify(looper.settings) !== JSON.stringify(form);

  const onBarsChange = (value: string) => {
    if (value === FREE_BARS) {
      setField({ free: true });
    } else {
      setField({ free: false, bars: parseInt(value, 10) });
    }
  };

  const barsValue = form.free ? FREE_BARS : String(form.bars);

  return (
    <div className="looper-panel" style={panelStyle} aria-label="Looper">
      <div style={{ ...rowStyle, justifyContent: "space-between" }}>
        <h6 style={{ margin: 0, color: "var(--text-muted)" }}>
          Looper{" "}
          <span className="badge rounded-pill bg-secondary" data-testid="looper-status">
            {getLooperStatusText(looper)}
          </span>
        </h6>
        <button
          type="button"
          className="btn btn-sm btn-secondary"
          title="Read the looper state from the amp"
          disabled={busy}
          onClick={() => run(() => looperViewModel.refresh())}
        >
          ↺ Refresh
        </button>
      </div>

      {support === "unknown" && (
        <p className="looper-note" style={{ margin: "0.5rem 0 0", color: "var(--text-muted)", fontSize: "0.85rem" }}>
          The connected amp model could not be identified. The looper only works on a Spark 2.
        </p>
      )}

      <div className="control-strip" style={{ ...rowStyle, marginTop: "0.5rem" }}>
        <button
          type="button"
          className={looper.isRecording || looper.isCountingIn ? "btn btn-sm btn-primary" : "btn btn-sm btn-secondary"}
          disabled={busy}
          onClick={() => run(() => looperViewModel.recDub())}
        >
          {labels.recDub}
        </button>
        <button
          type="button"
          className="btn btn-sm btn-secondary"
          disabled={busy || !canPlay}
          onClick={() => run(() => looperViewModel.playStop())}
        >
          {labels.playStop}
        </button>
        <button
          type="button"
          className="btn btn-sm btn-secondary"
          disabled={busy || !(looper.hasLoop || looper.canRedo) || looper.isRecording}
          onClick={() => run(() => looperViewModel.undoRedo())}
        >
          {labels.undoRedo}
        </button>
        <button
          type="button"
          className="btn btn-sm btn-secondary"
          disabled={busy || !(looper.hasLoop || looper.isRecording)}
          onClick={() => run(() => looperViewModel.deleteLoop())}
        >
          Delete
        </button>

        <span className="control-strip-label" data-testid="looper-position">
          {position
            ? `Bar ${position.bar}/${bars} · Beat ${position.beat}`
            : looper.measure != null
              ? `${Math.round(progress * 100)}%`
              : "—"}
        </span>
        <span className="control-strip-label">
          Loops: {looper.loopCount}
        </span>
      </div>

      <div
        role="progressbar"
        aria-label="Loop position"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
        style={{ height: 4, background: "var(--border)", borderRadius: 2, margin: "0.5rem 0", overflow: "hidden" }}
      >
        <div style={{ width: `${progress * 100}%`, height: "100%", background: "var(--accent)" }} />
      </div>

      <form
        style={rowStyle}
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            const ok = await looperViewModel.applySettings(form);
            if (ok) setDirty(false);
            return ok;
          });
        }}
      >
        <label style={fieldStyle}>
          <span className="control-strip-label">BPM</span>
          <input
            type="number"
            className="form-control form-control-sm"
            style={{ width: "5rem" }}
            min={LOOPER_MIN_BPM}
            max={LOOPER_MAX_BPM}
            value={form.bpm}
            onChange={(e) => setField({ bpm: parseInt(e.target.value, 10) || 0 })}
          />
        </label>
        {looper.ampBpm != null && (
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            title="Use the tempo reported by the amp"
            onClick={() => setField({ bpm: Math.round(looper.ampBpm) })}
          >
            Use amp tempo ({Math.round(looper.ampBpm)})
          </button>
        )}
        <label style={fieldStyle}>
          <span className="control-strip-label">Bars</span>
          <select
            className="form-control form-control-sm"
            style={{ width: "5.5rem" }}
            value={barsValue}
            onChange={(e) => onBarsChange(e.target.value)}
          >
            {LOOPER_BARS_OPTIONS.map((b) => (
              <option key={b} value={String(b)}>
                {b}
              </option>
            ))}
            {!form.free && !LOOPER_BARS_OPTIONS.includes(form.bars) && (
              <option value={String(form.bars)}>{form.bars}</option>
            )}
            <option value={FREE_BARS}>Free</option>
          </select>
        </label>
        <label style={fieldStyle}>
          <span className="control-strip-label">Feel</span>
          <select
            className="form-control form-control-sm"
            style={{ width: "7rem" }}
            value={String(form.count)}
            onChange={(e) => setField({ count: parseInt(e.target.value, 10) })}
          >
            <option value={String(LOOPER_COUNT_STRAIGHT)}>Straight</option>
            <option value={String(LOOPER_COUNT_SHUFFLE)}>Shuffle</option>
            {form.count !== LOOPER_COUNT_STRAIGHT && form.count !== LOOPER_COUNT_SHUFFLE && (
              <option value={String(form.count)}>{`0x${form.count.toString(16)}`}</option>
            )}
          </select>
        </label>
        <label style={fieldStyle}>
          <input
            type="checkbox"
            className="form-check-input"
            checked={form.click}
            onChange={(e) => setField({ click: e.target.checked })}
          />
          <span className="control-strip-label">Click &amp; count-in</span>
        </label>
        <button type="submit" className="btn btn-sm btn-secondary" disabled={busy}>
          Apply
        </button>
        {dirty && (
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            title="Discard the edits and show the amp's settings"
            disabled={busy}
            onClick={revertForm}
          >
            Revert
          </button>
        )}
        {ampSettingsDiffer && (
          <span className="control-strip-label" data-testid="looper-unsaved">
            Unsaved edits (amp settings differ)
          </span>
        )}
      </form>

      {looper.lastError && (
        <p role="alert" style={{ margin: "0.5rem 0 0", color: "var(--red)", fontSize: "0.85rem" }}>
          {looper.lastError}
        </p>
      )}
    </div>
  );
};

export default LooperPanel;
