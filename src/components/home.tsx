import * as React from "react";

import { HashRouter as Router, Route, NavLink, Switch } from "react-router-dom";

const HomeControl = () => {
  return (
    <div className="home-intro">
      <h1>Soundshed</h1>

      <p className="info">
        Browse and manage favourite tones, preview or store on your amp, share
        tones with the community. Jam to backing tracks and browse video lessons.
      </p>

      <NavLink to="/tones" exact>
        <section className="nav-section tones">
        <div className="section-container">
          <h2>Tones ▶</h2>
          <p>Browse community tones, manage your favourites.</p>
          </div>
        </section>
      </NavLink>

      <NavLink to="/device" exact >
        <section className="nav-section amp">
        <div className="section-container">
          <h2>Control Your Amp ▶</h2>
          <p>Control and modify amp settings</p>
          </div>
        </section>
      </NavLink>

     
        <NavLink to="/lessons" exact>
          <section className="nav-section jam">
            <div className="section-container">
            <h2>Jam ▶</h2>
            <p>Browse backing tracks and video lessons </p>
            </div>
          </section>
        </NavLink>
      
    </div>
  );
};

export default HomeControl;
