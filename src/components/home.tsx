import * as React from "react";

import { HashRouter as Router, Route, NavLink, Switch } from "react-router-dom";

const HomeControl = () => {

   
  return (
    <div className="home-intro">
      <h1>Soundshed</h1>

      <p className="info">
        Browse and manage favourite tones, preview or store on your amp, share
        tones with the community.
      </p>

      <p><NavLink to="/tones" exact className="btn btn-secondary">
                Browse Tones ▶
              </NavLink></p>

      <p><NavLink to="/device" exact className="btn btn-secondary">
                Control Amp ▶
              </NavLink></p>
    </div>
  );
};

export default HomeControl;
