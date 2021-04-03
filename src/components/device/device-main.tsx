import * as React from "react";
import { useEffect } from "react";
import { DeviceStateStore } from "../../stores/devicestate";
import { AppViewModelContext, deviceViewModel as vm } from "../app";
import DeviceControls from "./device-controls";
import MiscControls from "./misc-controls";
import SignalPathControl from "./signal-path";


const DeviceMainControl = () => {
  const appViewModel = React.useContext(AppViewModelContext);
  const deviceViewModel = vm;

  const onViewModelStateChange = () => {
    //setDevices(deviceViewModel.devices);
  };

  const connectionInProgress = DeviceStateStore.useState(
    (s) => s.isConnectionInProgress
  );
  const connected: boolean = DeviceStateStore.useState((s) => s.isConnected);
  const devices = DeviceStateStore.useState((s) => s.devices);
  const connectedDevice = DeviceStateStore.useState((s) => s.connectedDevice);
  const selectedChannel: number = DeviceStateStore.useState(
    (s) => s.selectedChannel
  );
  const currentPreset = DeviceStateStore.useState((s) => s.presetTone);

  const deviceScanInProgress = DeviceStateStore.useState(
    (s) => s.isDeviceScanInProgress
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
      console.log("Connecting device..");
      return deviceViewModel.connectDevice(targetDeviceInfo).then((ok) => {
        setTimeout(() => {
          if (connected == true) {
            console.log("Connected, refreshing preset..");
            requestCurrentPreset();
          }

        }, 1000);
      });
    } else {
      console.log("Target device not found..");
    }
  };

  const requestCurrentPreset = async (reconnect: boolean = false) => {
    if (reconnect) {
      //
      console.log("Reconnecting..");

      await deviceViewModel.connectDevice(connectedDevice);
    }

    deviceViewModel.requestCurrentChannelSelection().then(()=>{
      console.log("Got update channel selection info" );
    });

    deviceViewModel.requestPresetConfig().then((ok) => {
      setTimeout(() => {
        console.log(
          "updating preset config in UI " +
            JSON.stringify(DeviceStateStore.getRawState().presetTone)
        );
      }, 500);
    });
  };

  const requestSetChannel = (channelNum: number) => {
    deviceViewModel.setChannel(channelNum);
  };

  const requestStoreFavourite = (includeUpload: boolean = false) => {
    //save current preset

    appViewModel.storeFavourite(currentPreset, includeUpload);
  };

  const requestStoreHardwarePreset = () => {
    console.log("Would apply current preset to hardware channel");
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
    selectedChannel,
  ]);

  useEffect(() => {
    //console.log("Device main - component created");

    if (deviceViewModel) {
      deviceViewModel.addStateChangeListener(onViewModelStateChange);

      // init state
      onViewModelStateChange();
    }

    if (!connected) {
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
            devices={devices}
            selectedChannel={selectedChannel}
            onSetPreset={requestStoreHardwarePreset}
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
