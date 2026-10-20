import React, { useEffect } from "react";
import { FxMappingSparkToTone, FxMappingToneToSpark } from "../../core/fxMapping";
import { DeviceStateStore } from "../../stores/devicestate";
import { TonesStateStore } from "../../stores/tonestate";
import { UIFeatureToggleStore } from "../../stores/uifeaturetoggles";
import { appViewModel, DeviceViewModelContext } from "../app";
import ToneListControl from "../tone-list";
import ToneCloudSearchBar from "./tone-cloud-search";
import { useToneCloudSearch } from "../../core/toneCloudSearch";

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
  const isSearchInProgress = TonesStateStore.useState(
    (s) => s.isSearchInProgress
  );

  const toneCloudSearch = useToneCloudSearch((query) =>
    appViewModel.loadLatestToneCloudTones(false, query)
  );

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

    // requestPresetChange now resolves only once the upload and channel switch have
    // actually finished, and updates the UI from the tone we uploaded.
    if ((await deviceViewModel.requestPresetChange(p)) == false) {
      alert("Could not load tone. Please wait and try again.");
      return;
    }

    // No follow-up query: a Spark 2 answers a query for the virtual channel with the
    // contents of its selected hardware slot, which would show the wrong tone.

    onClose();
  };

  useEffect(() => {}, [tones, favourites, tonecloud]);

  // Populate the ToneCloud tab the first time it is opened, preferring the
  // cached results so opening the modal does not always hit the API.
  useEffect(() => {
    if (!show) return;
    if (viewSelection !== "tonecloud") return;
    if (tonecloud != null && tonecloud.length > 0) return;

    appViewModel.loadLatestToneCloudTones(true);
  }, [show, viewSelection]);

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
            enableFiltering={true}
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
              enableFiltering={true}
            />
          </div>
        );
      case "tonecloud":
        return (
          <div>
            <ToneCloudSearchBar
              keyword={toneCloudSearch.keyword}
              onKeywordChange={toneCloudSearch.setKeyword}
              onSearch={toneCloudSearch.search}
              onPrevious={toneCloudSearch.goPrevious}
              onNext={toneCloudSearch.goNext}
              page={toneCloudSearch.page}
              isFirstPage={toneCloudSearch.isFirstPage}
              isSearching={isSearchInProgress}
              canPage={toneCloudSearch.hasSearched}
            />
            <ToneListControl
              toneList={tonecloud}
              favourites={favourites}
              onApplyTone={onApplyTone}
              onEditTone={() => {}}
              noneMsg={
                isSearchInProgress
                  ? "Searching…"
                  : toneCloudSearch.hasSearched
                  ? "No ToneCloud tones matched that search."
                  : "Search ToneCloud for tones above."
              }
              enableToneEditor={false}
              enableFiltering={true}
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
