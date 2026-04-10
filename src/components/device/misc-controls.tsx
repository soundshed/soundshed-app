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
    <div className="container ">
      <div className="row control-strip">
        <div className="col-md-2">
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            onClick={() => requestCurrentPreset()}
          >
            Refresh
          </button>
        </div>
        {enableStorePreset ? (
          <div className="col-md-2">
            <button
              type="button"
              className="btn btn-sm btn-secondary"
              id="storePreset" title="Store settings to the current channel"
              onClick={()=>{ onSetPreset()}}
            >
              Store Settings
            </button>
          </div>
        ) : (
          ""
        )}

        <div className="col-md-4">
          <label>Channel </label>
          <div
            className="btn-group ms-2"
            role="group"
            aria-label="Channel Selection"
          >
            {Array.from({ length: numPresetSlots }, (_, i) => (
              <button
                key={i}
                type="button"
                className={
                  selectedChannel == i
                    ? "btn btn-sm btn-secondary active"
                    : "btn btn-sm btn-secondary"
                }
                id={`ch${i + 1}`}
                onClick={() => {
                  setChannel(i);
                }}
              >
                {i + 1}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MiscControls;
