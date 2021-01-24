import * as React from "react";

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
  onSetPreset
}) => {

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
            className="btn btn-sm btn-primary"
            onClick={onScanForDevices}
          >
            Scan
          </button>

          {deviceScanInProgress ==true? (
            <span
              className="spinner-border spinner-border-sm"
              role="status"
              aria-hidden="true"
            ></span>
          ) : null}
          <label>{devices?.length} device(s)</label>
        </div>
        <div className="col-md-2">
          {connected ? (
            <label>Connected</label>
          ) : (
            <div>
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={onConnect}
              >
                Connect
                {connectionInProgress ? (
                  <span
                    id="connect-progress"
                    className="spinner-border spinner-border-sm"
                    role="status"
                    aria-hidden="true"
                  ></span>
                ) : null}
              </button>
            </div>
          )}
        </div>
        <div className="col-md-2">
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            onClick={requestCurrentPreset}
          >
            Refresh
          </button>
        </div>
        <div className="col-md-2">
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            id="applyPreset"

            onClick={onSetPreset}
          >
            Set Preset
          </button>
        </div>
        <div className="col-md-4">
          <label>Channel - </label>
          <div
            className="btn-group"
            role="group"
            aria-label="Channel Selection"
          >
            <button
              type="button"
              className={
                selectedChannel == 0
                  ? "btn btn-sm btn-secondary active"
                  : "btn btn-sm btn-secondary"
              }
              id="ch1"
              onClick={() => {
                setChannel(0);
              }}
            >
              1
            </button>
            <button
              type="button"
              className={
                selectedChannel == 1
                  ? "btn btn-sm btn-secondary active"
                  : "btn btn-sm btn-secondary"
              }
              id="ch2"
              onClick={() => {
                setChannel(1);
              }}
            >
              2
            </button>
            <button
              type="button"
              className={
                selectedChannel == 2
                  ? "btn btn-sm btn-secondary active"
                  : "btn btn-sm btn-secondary"
              }
              id="ch3"
              onClick={() => {
                setChannel(2);
              }}
            >
              3
            </button>
            <button
              type="button"
              className={
                selectedChannel == 3
                  ? "btn btn-sm btn-secondary active"
                  : "btn btn-sm btn-secondary"
              }
              id="ch4"
              onClick={() => {
                setChannel(3);
              }}
            >
              4
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MiscControls;
