import * as React from "react";
import * as ReactDOM from "react-dom";
import { useEffect } from "react";
import { HashRouter as Router, Route, NavLink, Switch } from "react-router-dom";

import "bootstrap/dist/css/bootstrap.min.css";
import "../../css/styles.css";

import DeviceMainControl from "./device-main";
import ToneBrowserControl from "./tone-browser";
import AppViewModel, {
  AppStateStore,
  TonesStateStore,
} from "../core/appViewModel";
import HomeControl from "./home";
import AboutControl from "./about";
import DeviceViewModel, { DeviceStore } from "../core/deviceViewModel";
import { Button, Modal, Navbar } from "react-bootstrap";
import LoginControl from "./soundshed/login";
import LessonsControl from "./lessons";
import { Login } from "../core/soundshedApi";
import AmpOfflineControl from "./soundshed/amp-offline";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUser } from "@fortawesome/free-solid-svg-icons";
import EditToneControl from "./soundshed/edit-tone";

export const appViewModel: AppViewModel = new AppViewModel();
export const deviceViewModel: DeviceViewModel = new DeviceViewModel();

// export context providers for view models
export const AppViewModelContext = React.createContext(appViewModel);
export const DeviceViewModelContext = React.createContext(deviceViewModel);

const App = () => {
  const favourites = TonesStateStore.useState((s) => s.storedPresets);
  const tones = TonesStateStore.useState((s) => s.toneResults);

  const isNativeMode = AppStateStore.useState((s) => s.isNativeMode);
  const isUserSignedIn = AppStateStore.useState((s) => s.isUserSignedIn);

  const signInRequired = AppStateStore.useState((s) => s.isSignInRequired);

  const userInfo = AppStateStore.useState(s=> s.userInfo);

  const requireSignIn = async () => {
    AppStateStore.update((s) => {
      s.isSignInRequired = true;
    });
  };

  const performSignIn = (login: Login) => {
    return appViewModel.performSignIn(login).then((loggedInOk) => {
      if (loggedInOk == true) {
        AppStateStore.update((s) => {
          s.isSignInRequired = true;
        });
      }

      return loggedInOk;
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

    appViewModel.init();

    // load locally stored favourites
    appViewModel.loadFavourites();

    // get latest tones from soundshed api
    appViewModel.loadLatestTones();
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

          <li className="my-2">
            {isUserSignedIn ? (
              <span className="badge rounded-pill bg-primary"> <FontAwesomeIcon icon={faUser}></FontAwesomeIcon> {userInfo?.name}</span>
            ) : (
              <Button
                onClick={() => {
                  requireSignIn();
                }}
              >
                <FontAwesomeIcon icon={faUser}></FontAwesomeIcon>
              </Button>
            )}
          </li>
        </ul>

        <LoginControl
          signInRequired={signInRequired}
          onSignIn={performSignIn}
        ></LoginControl>

        <EditToneControl></EditToneControl>

        <AppViewModelContext.Provider value={appViewModel}>
          <DeviceViewModelContext.Provider value={deviceViewModel}>
            <Switch>
              <Route path="/" exact component={HomeControl} />
              <Route path="/device">
                {isNativeMode ? (
                  <DeviceMainControl></DeviceMainControl>
                ) : (
                  <AmpOfflineControl></AmpOfflineControl>
                )}
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
