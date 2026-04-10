import React, { useEffect } from "react";
import Modal from "react-bootstrap/Modal";
import Nav from "react-bootstrap/Nav";
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

  return (
    <Modal show={show} onHide={onClose} size="lg" dialogClassName="tone-chooser-modal">
      <Modal.Header closeButton>
        <Modal.Title>Choose a Tone</Modal.Title>
      </Modal.Header>
      <Modal.Body style={{ maxHeight: '70vh', overflowY: 'auto' }}>
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
        <div className="mt-2">{renderTonesView()}</div>
      </Modal.Body>
    </Modal>
  );
};

export default ToneChooserModal;
