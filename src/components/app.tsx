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
import DeviceViewModel, { DeviceStore } from "../core/deviceViewModel";
import { Modal } from "react-bootstrap";
import LoginControl from "./soundshed/login";
import LessonsControl from "./lessons";
import { Login } from "../core/soundshedApi";

export const appViewModel: AppViewModel = new AppViewModel();
export const deviceViewModel: DeviceViewModel = new DeviceViewModel();

// export context providers for view models
export const AppViewModelContext = React.createContext(appViewModel);
export const DeviceViewModelContext = React.createContext(deviceViewModel);

const App = () => {
  const [favourites, setFavourites] = React.useState(
    appViewModel.storedPresets
  );

  const [tones, setTones] = React.useState(appViewModel.tones ?? []);

  const [signInRequired, setSignInRequired] = React.useState(false);

  const requireSignIn = async () => {
    setSignInRequired(true);
  };

  const performSignIn = (login: Login) => {
    appViewModel.performSignIn(login).then((loggedIn) => {
      if (loggedIn) {
        setSignInRequired(false);
      } else {
        // sign in failed
      }
    });
  };
  // perform startup
  useEffect(() => {
    console.log("App startup..");

    const lastKnownDevices = deviceViewModel.getLastKnownDevices();
    if (lastKnownDevices.length > 0) {
      DeviceStore.update((s) => {
        s.devices = lastKnownDevices;
      });
    }

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
              to="/lessons"
              className="nav-link"
              activeClassName="nav-link active"
            >
              Lessons
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

        <LoginControl
          signInRequired={signInRequired}
          onSignIn={performSignIn}
        ></LoginControl>

        <AppViewModelContext.Provider value={appViewModel}>
          <DeviceViewModelContext.Provider value={deviceViewModel}>
            <Switch>
              <Route path="/" exact component={HomeControl} />
              <Route path="/device">
                <DeviceMainControl></DeviceMainControl>
              </Route>
              <Route path="/tones">
                <ToneBrowserControl
                  favourites={favourites}
                  tones={tones}
                ></ToneBrowserControl>
              </Route>
              <Route path="/lessons">
                <LessonsControl></LessonsControl>
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
