import * as React from "react";
import { useEffect } from "react";
import { FxMappingToneToSpark } from "../core/fxMapping";
import { Tone } from "../core/soundshedApi";
import { DeviceViewModelContext } from "./app";
import { HashRouter as Router, Route, NavLink, Switch } from "react-router-dom";
import { Nav } from "react-bootstrap";
import EditToneControl from "./soundshed/edit-tone";
import { ToneEditStore } from "../core/appViewModel";

const ToneBrowserControl = (props) => {
  const deviceViewModel = React.useContext(DeviceViewModelContext);

  const [viewSelection, setViewSelection] = React.useState("my");

  const onApplyTone = (t) => {
   /* if (!deviceViewModel.isConnected) {
      alert("The device is not yet connected, see Amp tab");
      return;
    }*/
    let p = new FxMappingToneToSpark().mapFrom(t);

    //p.meta.id = "E39EE16A-DE10-4646-8257-67917B608B63";
    deviceViewModel.requestPresetChange(p);
  };

  const onEditTone = (t) => {
    ToneEditStore.update(s=>{s.tone=t; s.isToneEditorOpen=true;});
  }

  const mapDeviceType = (t) => {
    if (t == "pg.spark40") {
      return "Spark 40";
    } else {
      return "Unknown Device Type";
    }
  };

  useEffect(() => {}, [props.tones, props.favourites]);



  const formatCategoryTags = (items: string[]) => {
    return items.map(i=>(
      <span key={i} className="badge rounded-pill bg-secondary">
      {i}
    </span>
    ));
  
  }

  const listItems = (t: Tone[], noneMsg: string = "none") => {
    if (!t || t.length == 0) {
      return <div>{noneMsg}</div>;
    }

    return t.map((tone: Tone) => (
      <div key={tone.toneId} className="tone">
        <div className="row">
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
            <div className="col-md-1">
            <button
              className="btn btn-sm btn-secondary"
              onClick={() => {
                onEditTone(tone);
              }}
            >
              📝
            </button>
          </div>
          <div className="col-md-6">
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
          <Nav.Item>
            <Nav.Link eventKey="my">My Tones</Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link eventKey="community">Community</Nav.Link>
          </Nav.Item>
        </Nav>

        {viewSelection == "my" ? (
          <div className="m-2">



            {listItems(props.favourites, "No favourite tones saved yet.")}
          </div>
        ) : (
          <div  className="m-2">{listItems(props.tones, "No community tones available.")}</div>
        )}
      </div>
    </div>
  );
};

export default ToneBrowserControl;
