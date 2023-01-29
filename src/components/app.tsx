import faUser from "@fortawesome/free-solid-svg-icons/faUser";
import faWindowMaximize from "@fortawesome/free-solid-svg-icons/faWindowMaximize";
import faWindowMinimize from "@fortawesome/free-solid-svg-icons/faWindowMinimize";
import faWindowRestore from "@fortawesome/free-solid-svg-icons/faWindowRestore";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import React, { useEffect } from "react";
import Draggable from "react-draggable";
import Container from "react-bootstrap/Container";
import Button from "react-bootstrap/Button";
import ReactDOM from "react-dom";
import { createRoot } from "react-dom/client";
import ReactPlayer from "react-player/youtube";
import {
  HashRouter as Router,
  NavLink,
  Route,
  Routes,
  unstable_HistoryRouter,
} from "react-router-dom";

import { createBrowserHistory } from "history";

import "bootstrap/dist/css/bootstrap.min.css";
import "../../css/styles.css";
import AppViewModel from "../core/appViewModel";
import DeviceViewModel from "../core/deviceViewModel";
import { LessonManager } from "../core/lessonManager";
import { Login, UserRegistration } from "../core/soundshedApi";
import { AppStateStore } from "../stores/appstate";
import { DeviceStateStore } from "../stores/devicestate";
import { LessonStateStore } from "../stores/lessonstate";
import { UIFeatureToggleStore } from "../stores/uifeaturetoggles";
import AboutControl from "./about";
import DeviceMainControl from "./device/device-main";
import DeviceSelectorControl from "./device/device-selector";
import HomeControl from "./home";
import LessonsControl from "./lessons";
import AmpOfflineControl from "./soundshed/amp-offline";
import EditToneControl from "./soundshed/edit-tone";
import LoginControl from "./soundshed/login";
import ToneBrowserControl from "./tone-browser";
import SettingsControl from "./settings";
import InputEventsControl from "./device/input-events";
import ScalexControl from "./scalex";

export const appViewModel: AppViewModel = new AppViewModel();
export const deviceViewModel: DeviceViewModel = new DeviceViewModel();
export const lessonManager: LessonManager = new LessonManager();

// export context providers for view models
export const AppViewModelContext = React.createContext(appViewModel);
export const DeviceViewModelContext = React.createContext(deviceViewModel);

const App = () => {
  const history = createBrowserHistory({ window });

  useEffect(() => {
    return history?.listen((evt) => {
      console.debug(`Navigated the page to: ${evt.location.pathname}`);
      appViewModel.logPageView(evt.location.pathname);
    });
  }, [history]);

  const isNativeMode = AppStateStore.useState((s) => s.isNativeMode);
  const isUserSignedIn = AppStateStore.useState((s) => s.isUserSignedIn);

  const signInRequired = AppStateStore.useState((s) => s.isSignInRequired);

  const userInfo = AppStateStore.useState((s) => s.userInfo);

  const isConnected = DeviceStateStore.useState((s) => s.isConnected);

  const playingVideoUrl = LessonStateStore.useState((s) => s.playingVideoUrl);
  const [isVideoExpanded, setIsVideoExpanded] = React.useState(true);

  const enableSoundshedLogin = UIFeatureToggleStore.useState(
    (s) => s.enableSoundshedLogin
  );

  const requireSignIn = async () => {
    AppStateStore.update((s) => {
      s.isSignInRequired = true;
    });
  };

  const performSignIn = (login: Login) => {
    return appViewModel.performSignIn(login).then((loggedInOk) => {
      if (loggedInOk == true) {
        AppStateStore.update((s) => {
          s.isSignInRequired = false;
        });
      }

      return loggedInOk;
    });
  };

  const performRegistration = (reg: UserRegistration) => {
    return appViewModel.performRegistration(reg).then((loggedInOk) => {
      if (loggedInOk == true) {
        AppStateStore.update((s) => {
          s.isSignInRequired = false;
        });
      }

      return loggedInOk;
    });
  };

  const performSignOut = () => {
    appViewModel.signOut();
  };

  // perform startup
  useEffect(() => {
    console.log("App startup..");

    const lastKnownDevices = []; // deviceViewModel.getLastKnownDevices();
    if (lastKnownDevices.length > 0) {
      DeviceStateStore.update((s) => {
        s.devices = lastKnownDevices;
      });
    }

    appViewModel.init();

    // load locally stored favourites
    appViewModel.loadFavourites();

    // get latest tones from soundshed api
    //appViewModel.loadLatestTones();

    if (UIFeatureToggleStore.getRawState().enabledPGToneCloud) {
      appViewModel.loadLatestToneCloudTones();
    }

    lessonManager.loadFavourites();

    appViewModel.loadSettings();

    // mock amp connection and current preset
    /* DeviceStore.update(s=>{
      s.isConnected=true; 
      s.presetTone=TonesStateStore.getRawState().storedPresets[0];
      s.connectedDevice= {name:"Mock Amp", address:"A1:B2:C3:D4:E5"};
    });*/

  }, []);

  let activeClassName = "nav-link active";
  let inactiveClassName = "nav-link";

  return (
    <main>
      <Container fluid>
        <ul className="nav nav-tabs">
          <li className="nav-item">
            <NavLink
              to="/"
              className={({ isActive }) =>
                isActive ? activeClassName : inactiveClassName
              }
            >
              Home
            </NavLink>
          </li>

          <li className="nav-item">
            <NavLink
              to="/tones"
              className={({ isActive }) =>
                isActive ? activeClassName : inactiveClassName
              }
            >
              Tones
            </NavLink>
          </li>
          <li className="nav-item">
            <NavLink
              to="/device"
              className={({ isActive }) =>
                isActive ? activeClassName : inactiveClassName
              }
            >
              Amp
            </NavLink>
          </li>
          <li className="nav-item">
            <NavLink
              to="/lessons"
              className={({ isActive }) =>
                isActive ? activeClassName : inactiveClassName
              }
            >
              Jam
            </NavLink>
          </li>
          <li className="nav-item">
            <NavLink
              to="/scalex"
              className={({ isActive }) =>
                isActive ? activeClassName : inactiveClassName
              }
            >
              Toolkit
            </NavLink>
          </li>
          <li className="nav-item">
            <NavLink
              to="/settings"
              className={({ isActive }) =>
                isActive ? activeClassName : inactiveClassName
              }
            >
              Settings
            </NavLink>
          </li>
          <li className="nav-item">
            <NavLink
              to="/about"
              className={({ isActive }) =>
                isActive ? activeClassName : inactiveClassName
              }
            >
              About
            </NavLink>
          </li>

          {enableSoundshedLogin ? (
            <li className="my-2">
              {isUserSignedIn ? (
                <span
                  className="badge rounded-pill bg-primary"
                  onClick={performSignOut}
                >
                  {" "}
                  <FontAwesomeIcon icon={faUser}></FontAwesomeIcon>{" "}
                  {userInfo?.name}
                </span>
              ) : (
                <button type="button"
                  className="btn btn-sm"
                  onClick={() => {
                    requireSignIn();
                  }}
                >
                  <FontAwesomeIcon icon={faUser}></FontAwesomeIcon>
                  Sign In
                </button>
              )}
            </li>
          ) : (
            ""
          )}
        </ul>

        {enableSoundshedLogin ? (
          <LoginControl
            signInRequired={signInRequired}
            onSignIn={performSignIn}
            onRegistration={performRegistration}
          ></LoginControl>
        ) : (
          ""
        )}

        {playingVideoUrl != null ? (
          <Draggable>
            <div className="pip-video-control">
              <div className="row">
                <div className="col">
                  <button
                    title="Close"
                    className="btn btn-sm btn-dark"
                    onClick={() => {
                      LessonStateStore.update((s) => {
                        s.playingVideoUrl = null;
                      });
                    }}
                  >
                    <FontAwesomeIcon icon={faWindowMinimize}></FontAwesomeIcon>
                  </button>
                </div>
                <div className="col offset-md-8">
                  {isVideoExpanded == true ? (
                    <button
                      title="Small Video"
                      className="btn btn-sm btn-dark"
                      onClick={() => {
                        setIsVideoExpanded(false);
                      }}
                    >
                      {" "}
                      <FontAwesomeIcon icon={faWindowRestore}></FontAwesomeIcon>
                    </button>
                  ) : (
                    <button
                      title="Large Video"
                      className="btn btn-sm btn-dark"
                      onClick={() => {
                        setIsVideoExpanded(true);
                      }}
                    >
                      <FontAwesomeIcon
                        icon={faWindowMaximize}
                      ></FontAwesomeIcon>
                    </button>
                  )}
                </div>
              </div>
              <div>
                <ReactPlayer
                  controls={true}
                  url={playingVideoUrl}
                  width={isVideoExpanded ? "640px" : "320px"}
                  height={isVideoExpanded ? "360px" : "180px"}
                />
              </div>
            </div>
          </Draggable>
        ) : (
          ""
        )}

        <EditToneControl></EditToneControl>

        <AppViewModelContext.Provider value={appViewModel}>
          <DeviceViewModelContext.Provider value={deviceViewModel}>
            <Routes>
              <Route path="/" element={<HomeControl />} />
              <Route
                path="/device"
                element={
                  isNativeMode ? (
                    isConnected ? (
                      <DeviceMainControl></DeviceMainControl>
                    ) : (
                      <DeviceSelectorControl></DeviceSelectorControl>
                    )
                  ) : (
                    <AmpOfflineControl></AmpOfflineControl>
                  )
                }
              />

              <Route path="/tones" element={<ToneBrowserControl />} />
              <Route path="/lessons" element={<LessonsControl />} />
              <Route path="/scalex" element={<ScalexControl />} />
              <Route path="/settings" element={<SettingsControl />} />
              <Route path="/about" element={<AboutControl />} />

            </Routes>
          </DeviceViewModelContext.Provider>
        </AppViewModelContext.Provider>

        <InputEventsControl></InputEventsControl>
      </Container>
    </main>
  );
};

const container = document.getElementById("app");
const root = createRoot(container!);
root.render(
  <Router>
    <App />
  </Router>
);
