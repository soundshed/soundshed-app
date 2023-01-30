import React, { useEffect } from "react";

import { FxMappingSparkToTone, FxMappingToneToSpark } from "../core/fxMapping";

import { appViewModel, DeviceViewModelContext } from "./app";
import Nav from "react-bootstrap/Nav";

import TcBrowserControl from "./external/tc-browser";
import ToneListControl from "./tone-list";
import { Utils } from "../core/utils";
import { UIFeatureToggleStore } from "../stores/uifeaturetoggles";
import { DeviceStateStore } from "../stores/devicestate";
import { ToneEditStore, TonesStateStore } from "../stores/tonestate";

const ToneBrowserControl = () => {
  const deviceViewModel = React.useContext(DeviceViewModelContext);

  const [viewSelection, setViewSelection] = React.useState("my");

  const enableMyTones = UIFeatureToggleStore.useState((s) => s.enableMyTones);
  const enableCommunityTones = UIFeatureToggleStore.useState(
    (s) => s.enableCommunityTones
  );

  const enableToneCloud = UIFeatureToggleStore.useState(
    (s) => s.enabledPGToneCloud
  );

  const enableToneEditor = UIFeatureToggleStore.useState(
    (s) => s.enableToneEditor
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
      //need to fetch the preset details
      let result = await appViewModel.loadToneCloudPreset(
        t.toneId.replace("pg.tc.", "")
      );

      if (result != null) {
        //convert xml to json
        let presetData = JSON.parse(result.preset_data);
        let toneData = new FxMappingSparkToTone().mapFrom(presetData);
        Object.assign(t, toneData);
        t.imageUrl = result.thumb_url;
      } else {
        // can't load this tone
        return;
      }
    }

    let p = new FxMappingToneToSpark().mapFrom(t);

    if ((await deviceViewModel.requestPresetChange(p)) == false) {
      alert("Could not load tone. Please wait and try again.");
    }

    // request current preset state
    await Utils.sleepAsync(2000);
    await deviceViewModel.requestPresetConfig();
  };

  const onEditTone = (t) => {
    if (enableToneEditor) {
      ToneEditStore.update((s) => {
        s.editTone = Utils.deepClone(t);
        s.isToneEditorOpen = true;
      });
    }
  };

  useEffect(() => {}, [tones, favourites, tonecloud]);

  const renderTonesView = () => {
    switch (viewSelection) {
      case "my":
        return (
          <div className="m-2">
            <ToneListControl
              toneList={favourites}
              favourites={favourites}
              onApplyTone={onApplyTone}
              onEditTone={onEditTone}
              noneMsg="No favourite tones saved yet."
              enableToneEditor={enableToneEditor}
            ></ToneListControl>
          </div>
        );
      case "community":
        return (
          <div className="m-2">
            <p>Tones shared by the Soundshed Community:</p>
            <ToneListControl
              toneList={tones}
              favourites={favourites}
              onApplyTone={onApplyTone}
              onEditTone={() => {}}
              noneMsg="No community tones available."
              enableToneEditor={false}
            ></ToneListControl>
          </div>
        );

      case "tonecloud":
        return (
          <div className="m-2">
            <p>Tones from the PG Tone Cloud:</p>
            <TcBrowserControl></TcBrowserControl>
          </div>
        );
    }
  };

  return (
    <div className="tones-intro">
      <h1>Tones</h1>

      <p>Browse and manage favourite tones.</p>

      <div className="info">
        <Nav
          variant="tabs"
          activeKey={viewSelection}
          onSelect={(selectedKey) => setViewSelection(selectedKey)}
        >
          {enableMyTones ? (
            <Nav.Item>
              <Nav.Link eventKey="my">My Tones</Nav.Link>
            </Nav.Item>
          ) : (
            ""
          )}

          {enableCommunityTones ? (
            <Nav.Item>
              <Nav.Link eventKey="community">Community</Nav.Link>
            </Nav.Item>
          ) : (
            ""
          )}

          {enableToneCloud ? (
            <Nav.Item>
              <Nav.Link eventKey="tonecloud">ToneCloud</Nav.Link>
            </Nav.Item>
          ) : (
            ""
          )}
        </Nav>

        {renderTonesView()}
      </div>
    </div>
  );
};

export default ToneBrowserControl;
