import React from "react";
import { AppStateStore } from "../../stores/appstate";

const MiscControls = ({
  deviceScanInProgress,
  connected,
  onConnect,
  connectionInProgress,
  requestCurrentPreset,
  setChannel,
  onScanForDevices,
  devices,
  selectedChannel,
  onSetPreset,
}) => {
  const enableStorePreset = true;
  const numPresetSlots = AppStateStore.useState((s) => s.numPresetSlots);
  React.useEffect(() => {
    // watch for changes
  }, [
    deviceScanInProgress,
    connected,
    connectionInProgress,
    devices,
    selectedChannel,
  ]);

  return (
    <div className="control-strip">
      <button
        type="button"
        className="btn btn-sm btn-secondary"
        onClick={() => requestCurrentPreset()}
        title="Refresh current preset from amp"
      >
        ↺ Refresh
      </button>

      {enableStorePreset && (
        <button
          type="button"
          className="btn btn-sm btn-secondary"
          id="storePreset"
          title="Store settings to the current channel"
          onClick={() => onSetPreset()}
        >
          ↓ Save to Amp
        </button>
      )}

      <span className="control-strip-divider" style={{ width: 1, height: 18, background: "var(--border)", display: "inline-block", margin: "0 4px" }} />

      <label>Channel</label>
      <div className="channel-btn-group">
        {Array.from({ length: numPresetSlots }, (_, i) => (
          <button
            key={i}
            type="button"
            className={selectedChannel === i ? "btn active" : "btn"}
            id={`ch${i + 1}`}
            onClick={() => setChannel(i)}
          >
            {i + 1}
          </button>
        ))}
      </div>
    </div>
  );
};

export default MiscControls;

