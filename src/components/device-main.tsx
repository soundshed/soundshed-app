import * as React from "react";
import { useEffect } from "react";

import SignalPathControl from "./signal-path";
import DeviceControls from "./device-controls";
import MiscControls from "./misc-controls";
import { BluetoothDeviceInfo } from "../spork/src/interfaces/deviceController";

import { Preset } from "../spork/src/interfaces/preset";
import { AppViewModelContext, DeviceViewModelContext } from "./app";

const DeviceMainControl = () => {
  const appViewModel = React.useContext(AppViewModelContext);
  const deviceViewModel = React.useContext(DeviceViewModelContext);

  const onViewModelStateChange = () => {
    setCurrentPreset(deviceViewModel.preset);
    setConnected(deviceViewModel.isConnected);
    setDevices(deviceViewModel.devices);
    setFavourites(deviceViewModel.storedPresets);
  };

  // connection state

  const [connectionInProgress, setConnectionInProgress] = React.useState(false);
  const [connected, setConnected] = React.useState(false);
  const [currentPreset, setCurrentPreset] = React.useState({});
  const [devices, setDevices] = React.useState<BluetoothDeviceInfo[]>([]);
  const [deviceScanInProgress, setDeviceScanInProgress] = React.useState(false);
  const [selectedChannel, setSelectedChannel] = React.useState(0);
  const [presetConfig, setPresetConfig] = React.useState({});
  const [favourites, setFavourites] = React.useState([]);

  const [
    selectedDevice,
    setSelectedDevice,
  ] = React.useState<BluetoothDeviceInfo>(null);

  const requestScanForDevices = () => {
    setDeviceScanInProgress(true);

    deviceViewModel.scanForDevices().then((ok) => {
      setTimeout(() => {
        setDeviceScanInProgress(false);
      }, 5000);
    });
  };

  const requestConnectDevice = (targetDeviceAddress: string = null) => {
    if (devices == null || (devices?.length == 0 && !targetDeviceAddress)) {
      return;
    }

    setConnectionInProgress(true);

    // if no target device specified connect to first known device.

    let currentDevice = selectedDevice;
    if (devices?.length > 0 && selectedDevice == null) {
      if (targetDeviceAddress != null) {
        currentDevice = devices.find((d) => d.address == targetDeviceAddress);
      }

      if (currentDevice == null) {
        currentDevice = devices[0];
      }

      setSelectedDevice(currentDevice);
    }

    let deviceList = devices;
    if (deviceList == null && selectedDevice) {
      deviceList = [selectedDevice];
    }

    console.log("Connecting device..");
    deviceViewModel.connectDevice(currentDevice).then((ok) => {
      setConnected(true);
      setConnectionInProgress(false);

      setTimeout(() => {
        requestCurrentPreset();
      }, 1000);
    });
  };

  const requestCurrentPreset = () => {
    setConnectionInProgress(true);

    deviceViewModel.requestPresetConfig().then((ok) => {
      setConnectionInProgress(false);
      setTimeout(() => {
        console.log(
          "updating preset config in UI " +
            JSON.stringify(deviceViewModel.preset)
        );

        setCurrentPreset(deviceViewModel.preset);
      }, 500);
    });
  };

  const requestSetChannel = (channelNum: number) => {
    setConnectionInProgress(true);

    deviceViewModel.setChannel(channelNum).then((ok) => {
      setConnectionInProgress(false);
      setSelectedChannel(channelNum);
    });
  };

  const requestSetPreset = () => {
    let preset: Preset = currentPreset;
    preset.sigpath[3].dspId = "94MatchDCV2";

    setConnectionInProgress(true);

    deviceViewModel.requestPresetChange(preset).then((ok) => {
      setConnectionInProgress(false);
    });
  };

  const requestStoreFavourite = (includeUpload:boolean=false) => {
    //save current preset

    appViewModel.storeFavourite(currentPreset, includeUpload);
  };

  const fxParamChange = (args) => {
    deviceViewModel.requestFxParamChange(args).then(() => {});
  };

  const fxToggle = (args) => {
    deviceViewModel.requestFxToggle(args).then(() => {});
  };

  // configure which state changes should cause component updates
  useEffect(() => {}, [
    connectionInProgress,
    connected,
    deviceScanInProgress,
    currentPreset,
  ]);

  useEffect(() => {
    //console.log("Device main - component created");

    if (deviceViewModel) {
      deviceViewModel.addStateChangeListener(onViewModelStateChange);
    
      // init state
      onViewModelStateChange();
    }

    if (!deviceViewModel.isConnected) {
      const lastConnectedDevice = deviceViewModel.getLastConnectedDevice();

      if (lastConnectedDevice) {
        console.log(
          "Re-connecting last known device [" + lastConnectedDevice.name + "]"
        );
        requestConnectDevice(lastConnectedDevice.address);
      }
    }

    return () => {
      if (deviceViewModel) {
        deviceViewModel.removeStateChangeListener();
      }
    };
  }, []);

  return (
    <div className="amp-intro">
      <div className="row">
        <div className="col">
          <DeviceControls></DeviceControls>
        </div>
      </div>
      <div className="row">
        <div className="col">
          <MiscControls
            deviceScanInProgress={deviceScanInProgress}
            onScanForDevices={requestScanForDevices}
            connected={connected}
            onConnect={requestConnectDevice}
            connectionInProgress={connectionInProgress}
            requestCurrentPreset={requestCurrentPreset}
            setChannel={requestSetChannel}
            devices={deviceViewModel.devices}
            selectedChannel={selectedChannel}
            onSetPreset={requestSetPreset}
          ></MiscControls>
        </div>
      </div>
      <div className="row">
        <div className="col">
          <SignalPathControl
            signalPathState={currentPreset}
            onFxParamChange={fxParamChange}
            onFxToggle={fxToggle}
            selectedChannel={selectedChannel}
            onStoreFavourite={requestStoreFavourite}
          ></SignalPathControl>
        </div>
      </div>
    </div>
  );
};

export default DeviceMainControl;
