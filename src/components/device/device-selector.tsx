import React, { useEffect } from "react";
import Button from "react-bootstrap/Button";
import { BluetoothDeviceInfo } from "../../spork/src/interfaces/deviceController";
import { DeviceStateStore } from "../../stores/devicestate";
import { deviceViewModel } from "../app";
import PedalboardControl from "../pedalboard/pedalboard";

const DeviceSelectorControl = () => {
  const connectionInProgress = DeviceStateStore.useState(
    (s) => s.isConnectionInProgress
  );
  const connected: boolean = DeviceStateStore.useState((s) => s.isConnected);
  const devices = DeviceStateStore.useState((s) => s.devices);
  const connectedDevice = DeviceStateStore.useState((s) => s.connectedDevice);
  const attemptedDevice = DeviceStateStore.useState(
    (s) => s.lastAttemptedDevice
  );

  const deviceScanInProgress = DeviceStateStore.useState(
    (s) => s.isDeviceScanInProgress
  );
  const deviceScanFailed = DeviceStateStore.useState((s) => s.deviceScanFailed);
  const deviceConnectionFailed = DeviceStateStore.useState(
    (s) => s.deviceConnectionFailed
  );
  const requestScanForDevices = () => {
    deviceViewModel.scanForDevices();
  };

  const requestConnectDevice = (targetDeviceAddress: string = null) => {
    if (devices == null || devices?.length == 0) {
      // nothing to connect to
      return;
    }

    // if connect to target device or first known device.

    let targetDeviceInfo = null;

    if (targetDeviceAddress != null) {
      targetDeviceInfo = devices.find((d) => d.address == targetDeviceAddress);
    } else {
      targetDeviceInfo = devices[0];
    }

    if (targetDeviceInfo != null) {
      console.info("Connecting device..");
      return deviceViewModel.connectDevice(targetDeviceInfo).then((ok) => {
        setTimeout(() => {
          if (ok == true) {
            console.info("Connected, refreshing preset..");
          } else {
            console.error("Connection failed.");
          }
        }, 1000);
      });
    } else {
      console.warn("Target device not found..");
    }
  };

  useEffect(() => {
    if (!connected) {
      const lastConnectedDevice = deviceViewModel.getLastConnectedDevice();

      if (lastConnectedDevice) {
        console.info(
          "Re-connecting last known device [" + lastConnectedDevice.name + "]"
        );
        requestConnectDevice(lastConnectedDevice.address);
      }
    }
  }, []);

  useEffect(() => {
    // listen for specific state changes
  }, [deviceConnectionFailed, deviceScanFailed, deviceScanInProgress]);

  const listItems = (l: BluetoothDeviceInfo[]) => {
    let list = l.map((i) =>
      attemptedDevice != null && attemptedDevice.address == i.address
        ? attemptedDevice
        : i
    );

    if (deviceScanFailed) {
      return (
        <div className="alert alert-warning">
          Could not scan for devices or scan was cancelled. Bluetooth may not be
          switched on or your browser/OS may not support Bluetooth.
        </div>
      );
    }

    if (deviceConnectionFailed) {
      return (
        <div className="alert alert-danger">
          Failed to connect to device. Try restarting the device, restarting
          your computer or unpair the device and try again.
        </div>
      );
    }
    if (!list || list?.length == 0) {
      return <div>No devices found. Scan to check for devices.</div>;
    } else {
      return list.map((d) => (
        <div key={d.address.toString()} className="row m-2">
          <div className="col-md-6">
            <span className="badge rounded-pill bg-secondary">{d.name}</span> (
            {d.address})
            {d.connectionFailed == true ? (
              <p className="text-warning">
                Connection failed. Check device is on and paired with this
                computer.
              </p>
            ) : (
              ""
            )}
          </div>
          <div className="col-md-2">{d.description}</div>

          <div className="col-md-2">
            <button type="button"
              className="btn btn-sm"
              onClick={() => {
                requestConnectDevice(d.address);
              }}
            >
              Connect
            </button>
          </div>
        </div>
      ));
    }
  };

  return (
    <div className="amp-intro">
      <h4>Connect Your Amp</h4>
      <p>
        To get started, switch on your amp, pair it via Bluetooth (Spark 40 BLE
        or Spark Mini) and then select Scan to find your device. You should
        ensure that the amp is not already connected to a different device as
        the amp can only connect to one device at a time.
      </p>

      {deviceScanInProgress ? (
        <div>
          <span
            className="spinner-border spinner-border-sm"
            role="status"
            aria-hidden="true"
          ></span>{" "}
          Searching for devices..
        </div>
      ) : (
        <button
          type="button"
          className="btn btn-sm btn-primary"
          onClick={requestScanForDevices}
        >
          Scan
        </button>
      )}

      <p>When found, click connect to complete:</p>
      <div className="m-2">
        <h4>Devices</h4>
        <div>{listItems(devices)}</div>
      </div>

      <div className="pedalboard">
        <PedalboardControl></PedalboardControl>
      </div>
    </div>
  );
};

export default DeviceSelectorControl;
