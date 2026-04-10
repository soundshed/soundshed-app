import React, { useEffect } from "react";
import { FxMappingSparkToTone, FxMappingToneToSpark } from "../../core/fxMapping";
import { Utils } from "../../core/utils";
import { DeviceStateStore } from "../../stores/devicestate";
import { TonesStateStore } from "../../stores/tonestate";
import { UIFeatureToggleStore } from "../../stores/uifeaturetoggles";
import { appViewModel, DeviceViewModelContext } from "../app";
import ToneListControl from "../tone-list";

interface ToneChooserModalProps {
  show: boolean;
  onClose: () => void;
}

const ToneChooserModal = ({ show, onClose }: ToneChooserModalProps) => {
  const deviceViewModel = React.useContext(DeviceViewModelContext);

  const [viewSelection, setViewSelection] = React.useState("my");

  const enableMyTones = UIFeatureToggleStore.useState((s) => s.enableMyTones);
  const enableCommunityTones = UIFeatureToggleStore.useState(
    (s) => s.enableCommunityTones
  );
  const enableToneCloud = UIFeatureToggleStore.useState(
    (s) => s.enabledPGToneCloud
  );

  const isDeviceConnected = DeviceStateStore.useState((s) => s.isConnected);

  const favourites = TonesStateStore.useState((s) => s.storedPresets);
  const tones = TonesStateStore.useState((s) => s.toneResults);
  const tonecloud = TonesStateStore.useState((s) => s.toneCloudResults);

  const onApplyTone = async (tone) => {
    let t = Object.assign({}, tone);
    if (!isDeviceConnected) {
      alert("The device is not yet connected, see the Amp tab");
      return;
    }

    if (t.schemaVersion == "pg.preset.summary" && t.fx == null) {
      let result = await appViewModel.loadToneCloudPreset(
        t.toneId.replace("pg.tc.", "")
      );

      if (result != null) {
        let presetData = JSON.parse(result.preset_data);
        let toneData = new FxMappingSparkToTone().mapFrom(presetData);
        Object.assign(t, toneData);
        t.imageUrl = result.thumb_url;
      } else {
        return;
      }
    }

    let p = new FxMappingToneToSpark().mapFrom(t);

    if ((await deviceViewModel.requestPresetChange(p)) == false) {
      alert("Could not load tone. Please wait and try again.");
    }

    await Utils.sleepAsync(2000);
    await deviceViewModel.requestPresetConfig();

    onClose();
  };

  useEffect(() => {}, [tones, favourites, tonecloud]);

  const renderTonesView = () => {
    switch (viewSelection) {
      case "my":
        return (
          <ToneListControl
            toneList={favourites}
            favourites={favourites}
            onApplyTone={onApplyTone}
            onEditTone={() => {}}
            noneMsg="No favourite tones saved yet."
            enableToneEditor={false}
          />
        );
      case "community":
        return (
          <div>
            <p>Tones shared by the Soundshed Community:</p>
            <ToneListControl
              toneList={tones}
              favourites={favourites}
              onApplyTone={onApplyTone}
              onEditTone={() => {}}
              noneMsg="No community tones available."
              enableToneEditor={false}
            />
          </div>
        );
      case "tonecloud":
        return (
          <div>
            <p>Tones from the PG Tone Cloud:</p>
            <ToneListControl
              toneList={tonecloud}
              favourites={favourites}
              onApplyTone={onApplyTone}
              onEditTone={() => {}}
              noneMsg="No ToneCloud tones loaded."
              enableToneEditor={false}
            />
          </div>
        );
    }
  };

  if (!show) return null;

  return (
    <div className="ss-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ss-modal">

        {/* Header */}
        <div className="ss-modal-header">
          <h2 className="ss-modal-title">Choose a Tone</h2>
          <button className="ss-modal-close" onClick={onClose} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="ss-tabs">
          {enableMyTones && (
            <button className={`ss-tab${viewSelection === "my" ? " active" : ""}`} onClick={() => setViewSelection("my")}>My Tones</button>
          )}
          {enableCommunityTones && (
            <button className={`ss-tab${viewSelection === "community" ? " active" : ""}`} onClick={() => setViewSelection("community")}>Community</button>
          )}
          {enableToneCloud && (
            <button className={`ss-tab${viewSelection === "tonecloud" ? " active" : ""}`} onClick={() => setViewSelection("tonecloud")}>ToneCloud</button>
          )}
        </div>

        {/* Body */}
        <div className="ss-modal-body">
          {renderTonesView()}
        </div>

      </div>
    </div>
  );
};

export default ToneChooserModal;
