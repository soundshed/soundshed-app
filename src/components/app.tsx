import * as React from "react";
import * as ReactDOM from "react-dom";
import { useEffect } from "react";
import { HashRouter as Router, Route, NavLink, Switch } from "react-router-dom";

import "bootstrap/dist/css/bootstrap.min.css";
import "../../css/styles.css";

import DeviceMainControl from "./device-main";
import ToneBrowserControl from "./tone-browser";
import AppViewModel from "../core/appViewModel";
import HomeControl from "./home";
import AboutControl from "./about";
import DeviceViewModel from "../core/deviceViewModel";

let appViewModel: AppViewModel = new AppViewModel();
let deviceViewModel: DeviceViewModel = new DeviceViewModel();

// export context providers for view models
export const AppViewModelContext = React.createContext(appViewModel);
export const DeviceViewModelContext = React.createContext(deviceViewModel);

const App = () => {
  const [favourites, setFavourites] = React.useState(
    appViewModel.storedPresets
  );

  const [tones, setTones] = React.useState(appViewModel.tones ?? []);

  // perform startup
  useEffect(() => {
    console.log("App startup..");

    let f = appViewModel.loadFavourites();

    setFavourites(f);

    // get latest tones from soundshed api
    appViewModel.loadLatestTones().then((tones) => {
      setTones(tones);
    });
  }, []);

  useEffect(() => {}, [tones, favourites]);

  return (
    <Router>
      <main>
        <ul className="nav nav-tabs">
          <li className="nav-item">
            <NavLink
              to="/"
              exact
              className="nav-link"
              activeClassName="nav-link active"
            >
              Home
            </NavLink>
          </li>
          <li className="nav-item">
            <NavLink
              to="/tones"
              className="nav-link"
              activeClassName="nav-link active"
            >
              Tones
            </NavLink>
          </li>
          <li className="nav-item">
            <NavLink
              to="/device"
              className="nav-link"
              activeClassName="nav-link active"
            >
              Amp
            </NavLink>
          </li>
          <li className="nav-item">
            <NavLink
              to="/about"
              className="nav-link"
              activeClassName="nav-link active"
            >
              About
            </NavLink>
          </li>
        </ul>
        <AppViewModelContext.Provider value={appViewModel}>
          <DeviceViewModelContext.Provider value={deviceViewModel}>
            <Switch>
              <Route path="/" exact component={HomeControl} />
              <Route
                path="/device"
                render={() => <DeviceMainControl></DeviceMainControl>}
              />
              <Route
                path="/tones"
                >
                  <ToneBrowserControl
                    favourites={favourites}
                    tones={tones}
                  ></ToneBrowserControl>
                
              </Route>
              <Route path="/about" exact component={AboutControl} />
            </Switch>
          </DeviceViewModelContext.Provider>
        </AppViewModelContext.Provider>
      </main>
    </Router>
  );
};

ReactDOM.render(<App />, document.getElementById("app"));
