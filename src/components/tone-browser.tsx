import * as React from "react";
import { useEffect } from "react";
import { FxMappingSparkToTone, FxMappingToneToSpark } from "../core/fxMapping";
import { Tone } from "../core/soundshedApi";
import { appViewModel, DeviceViewModelContext } from "./app";
import { Nav, Image } from "react-bootstrap";

import {
  ToneEditStore,
  TonesStateStore,
  UIFeatureToggleStore,
} from "../core/appViewModel";
import { DeviceStore } from "../core/deviceViewModel";

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

  const isDeviceConnected = DeviceStore.useState((s) => s.isConnected);

  const favourites = TonesStateStore.useState((s) => s.storedPresets);
  const tones = TonesStateStore.useState((s) => s.toneResults);
  const tonecloud = TonesStateStore.useState((s) => s.toneCloudResults);

  const onApplyTone = async (tone) => {
    let t = Object.assign({}, tone);
    /*if (!isDeviceConnected) {
      alert("The device is not yet connected, see the Amp tab");
      return;
    }
*/

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

    deviceViewModel.requestPresetChange(p);
  };

  const onEditTone = (t) => {
    if (enableToneEditor) {
      ToneEditStore.update((s) => {
        s.tone = t;
        s.isToneEditorOpen = true;
      });
    }
  };

  const mapDeviceType = (t) => {
    if (t == "pg.spark40") {
      return "Spark 40";
    } else {
      return "Unknown Device Type";
    }
  };

  useEffect(() => {}, [tones, favourites, tonecloud]);

  const formatCategoryTags = (items: string[]) => {
    return items.map((i) => (
      <span key={i} className="badge rounded-pill bg-secondary">
        {i}
      </span>
    ));
  };

  const listItems = (t: Tone[], noneMsg: string = "none") => {
    if (!t || t.length == 0) {
      return <div>{noneMsg}</div>;
    }

    return t.map((tone: Tone) => (
      <div key={tone.toneId} className="tone">
        <div className="row">
          {tone.imageUrl ? (
            <div className="col-md-1">

<button
              className="btn btn-sm btn-secondary"
              onClick={() => {
                onApplyTone(tone);
              }}
            >
              ▶
            </button>
            
              <img src={tone.imageUrl} width="128px"/>
              
            </div>
          ) : (
            <div className="col-md-1">
            <button
              className="btn btn-sm btn-secondary"
              onClick={() => {
                onApplyTone(tone);
              }}
            >
              ▶
            </button>
          </div>

          )}
         
          {enableToneEditor ? (
            <div className="col-md-1 ms-2">
              <button
                className="btn btn-sm btn-secondary"
                onClick={() => {
                  onEditTone(tone);
                }}
              >
                📝
              </button>
            </div>
          ) : (
            ""
          )}

          <div className="col-md-4">
            <label>{tone.name}</label>
            <p>{tone.description}</p>
          </div>
          <div className="col-md-4">
            {formatCategoryTags(tone.artists)}
            {formatCategoryTags(tone.categories)}

            <span className="badge rounded-pill bg-secondary">
              {mapDeviceType(tone.deviceType)}
            </span>
          </div>
        </div>
      </div>
    ));
  };

  const renderTonesView = () => {
    switch (viewSelection) {
      case "my":
        return (
          <div className="m-2">
            {listItems(favourites, "No favourite tones saved yet.")}
          </div>
        );
      case "community":
        return (
          <div className="m-2">
            <p>Tones shared by the Soundshed Community:</p>
            {listItems(tones, "No community tones available.")}
          </div>
        );

      case "tonecloud":
        return (
          <div className="m-2">
            <p>Tones from the PG Tone Cloud:</p>
            {listItems(tonecloud, "No PG tonecloud tones available.")}
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
          variant="pills"
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
