import * as React from "react";
import { useEffect } from "react";
import { FxMappingSparkToTone, FxMappingToneToSpark } from "../../core/fxMapping";
import { Tone } from "../../core/soundshedApi";
import { appViewModel, DeviceViewModelContext } from "../app";
import { Nav, Image, Form } from "react-bootstrap";

import {
    ToneEditStore,
    TonesStateStore,
    UIFeatureToggleStore,
} from "../../core/appViewModel";

import { DeviceStore } from "../../core/deviceViewModel";
import ToneListControl from "../tone-list";
import { PGPresetQuery } from "../../spork/src/devices/spark/sparkAPI";

const TcBrowserControl = () => {
    const deviceViewModel = React.useContext(DeviceViewModelContext);

    const favourites = TonesStateStore.useState((s) => s.storedPresets);

    const defaultPageIndex = 1;
    const [pageIndex, setPageIndex] = React.useState(defaultPageIndex);
    const [keyword, setKeyword] = React.useState("");


    const isDeviceConnected = DeviceStore.useState((s) => s.isConnected);

    const tcResults = TonesStateStore.useState((s) => s.toneCloudResults);

    useEffect(() => { }, [favourites])

    const onRefresh = (pageIdx) => {
        let query: PGPresetQuery = { page: pageIdx ?? pageIndex, keyword: keyword };
        appViewModel.loadLatestToneCloudTones(false, query);
    }

    const onSearch = () => {
        setPageIndex(defaultPageIndex);
        onRefresh(defaultPageIndex);
    }

    const next = () => {
        let idx = pageIndex + 1;
        setPageIndex(idx);
        onRefresh(idx);
    }

    const previous = () => {
        if (pageIndex == 1) return;

        let idx = pageIndex - 1;
        setPageIndex(idx);
        onRefresh(idx);
    }

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

    return (

        <div className="m2">
            <Form>

                <Form.Group controlId="formSearch">
                    <Form.Label>Keyword</Form.Label>
                    <Form.Control
                        type="text"
                        placeholder="Search by keyword"
                        value={keyword}
                        onChange={(event) => {
                            setKeyword(event.target.value);
                        }}
                    />
                </Form.Group>
            </Form>
            <button className="btn btn-sm btn-success" onClick={onSearch}>Search</button>
            <ToneListControl toneList={tcResults} favourites={favourites} onApplyTone={onApplyTone} onEditTone={() => { }} noneMsg="No PG ToneCloud Results" enableToneEditor={false}></ToneListControl>

            <button className="btn btn-sm btn-primary" onClick={previous}>Previous</button> <button className="btn btn-sm btn-primary" onClick={next}>Next</button>
        </div>
    );
};

export default TcBrowserControl;
