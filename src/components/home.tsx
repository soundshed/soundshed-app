import React from "react";
import { NavLink } from "react-router-dom";
import { IconAmpSpeaker, IconMusic, IconFretboard, IconSettings, IconChevronRight } from "./icons";

const HomeControl = () => {
  return (
    <div className="home-intro">
      <div className="home-layout">

        {/* ── Left: hero + cards ── */}
        <div className="home-left">
          <div className="home-hero">
            <h1>Soundshed Control</h1>
            <p className="subtitle">
              Browse and manage favourite tones, preview or store on your amp.<br />
              Jam to backing tracks and explore video lessons.
            </p>
          </div>

          <NavLink to="/device" style={{ textDecoration: "none" }}>
            <div className="magic-card">
              <IconAmpSpeaker size={28} className="card-icon" />
              <h2>Control Your Amp</h2>
              <p>Manage amp settings, browse community tones, save your favourites.</p>
              <IconChevronRight size={18} className="card-arrow" />
            </div>
          </NavLink>

          <NavLink to="/lessons" style={{ textDecoration: "none" }}>
            <div className="magic-card">
              <IconMusic size={28} className="card-icon" />
              <h2>Jam</h2>
              <p>Browse backing tracks and video lessons to play along with.</p>
              <IconChevronRight size={18} className="card-arrow" />
            </div>
          </NavLink>

          <NavLink to="/scalex" style={{ textDecoration: "none" }}>
            <div className="magic-card">
              <IconFretboard size={28} className="card-icon" />
              <h2>Toolkit</h2>
              <p>Learn scales and chords across a range of tunings.</p>
              <IconChevronRight size={18} className="card-arrow" />
            </div>
          </NavLink>

          <NavLink to="/settings" style={{ textDecoration: "none" }}>
            <div className="magic-card">
              <IconSettings size={28} className="card-icon" />
              <h2>Settings</h2>
              <p>Configure MIDI mappings and app preferences.</p>
              <IconChevronRight size={18} className="card-arrow" />
            </div>
          </NavLink>
        </div>

        {/* ── Right: hero image with MagicUI glow frame ── */}
           <NavLink to="/device" style={{ textDecoration: "none" }}>
        <div className="home-right" aria-hidden="true">
          {/* ambient glow orb behind the frame */}
          <div className="home-glow-orb" />
          {/* border-beam frame */}
          <div className="home-image-frame">
            <img
              src="/images/dark-rider-JmVaNyemtN8-unsplash.jpg"
              alt=""
              className="home-image"
            />
            {/* gradient vignette fading into page bg */}
            <div className="home-image-vignette" />
            {/* travelling border-beam particle */}
            <span className="home-border-beam" />
          </div>
        </div>
        </NavLink>

      </div>
    </div>
  );
};

export default HomeControl;
