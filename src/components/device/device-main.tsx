import React, { useEffect } from "react";
import { DeviceStateStore } from "../../stores/devicestate";
import { appViewModel, deviceViewModel as vm } from "../app";
import AmpDesk, { FxParamChangeArgs, FxToggleArgs } from "./desk/amp-desk";

const DeviceMainControl = () => {
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
      console.info("Connecting device..");
      deviceViewModel.connectDevice(targetDeviceInfo).then((connectedOk) => {
        console.warn("Completed initial connection to device..");
      });
    } else {
      console.warn("Target device not found..");
    }
  };

  const requestCurrentPreset = async (reconnect: boolean = false) => {
    if (reconnect) {
      console.info("Reconnecting..");
      await deviceViewModel.connectDevice(connectedDevice);
    } else {
      await deviceViewModel.requestPresetConfig();
    }
  };

  const requestSetChannel = (channelNum: number) => {
    deviceViewModel.setChannel(channelNum);
  };

  const requestStoreFavourite = (includeUpload: boolean = false) => {
    //save current preset

    return appViewModel.storeFavourite(currentPreset, includeUpload);
  };

  // Always an explicit hardware slot chosen in the Save to Amp picker, never the
  // virtual channel; the view model refuses anything else and resolves false.
  const requestStoreHardwarePreset = (slot: number, name: string) => {
    return deviceViewModel.storeCurrentPreset(slot, name);
  };

  const fxParamChange = (args: FxParamChangeArgs) => {
    deviceViewModel.requestFxParamChange(args).then(() => {});
  };

  const fxToggle = (args: FxToggleArgs) => {
    deviceViewModel.requestFxToggle(args).then(() => {});
  };

  const fxChange = async (args: { dspIdOld: string; dspIdNew: string }) => {
    try {
      return (await deviceViewModel.requestFxChange(args)) === true;
    } catch (err) {
      console.warn("Fx change failed: " + err);
      return false;
    }
  };

  // configure which state changes should cause component updates
  useEffect(() => {}, [
    connectionInProgress,
    connected,
    deviceScanInProgress,
    selectedChannel,
  ]);

  useEffect(() => {
    if (deviceViewModel) {
      deviceViewModel.addStateChangeListener(onViewModelStateChange);

      // init state
      onViewModelStateChange();
    }

    if (!connected) {
      const lastConnectedDevice = deviceViewModel.getLastConnectedDevice();

      if (lastConnectedDevice) {
        console.info(
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
    <AmpDesk
      onRefresh={() => void requestCurrentPreset()}
      onSetChannel={requestSetChannel}
      onSaveToAmp={requestStoreHardwarePreset}
      onRenameLocal={(name) => deviceViewModel.renameTone(name)}
      onRenameChannel={(slot, name) => deviceViewModel.renameChannelPreset(slot, name)}
      onStoreFavourite={() => requestStoreFavourite(false)}
      onFxParamChange={fxParamChange}
      onFxToggle={fxToggle}
      onFxChange={fxChange}
    />
  );
};

export default DeviceMainControl;
