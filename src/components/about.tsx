import React from "react";

import { appViewModel } from "./app";
import { AppStateStore } from "../stores/appstate";
import { openLink } from "../core/platformUtils";
import env from "../env";

const AboutControl = () => {
  React.useEffect(() => {
    appViewModel.refreshAppInfo();
    checkForUpdates();
  }, []);

  const appInfo = AppStateStore.useState((s) => s.appInfo);
  const appUpdateAvailable = AppStateStore.useState((s) => s.isUpdateAvailable);
  const isWebMode = env.IsWebMode;
  React.useEffect(() => {}, [appUpdateAvailable, appInfo]);

  const checkForUpdates = async (showInfo: boolean = false) => {
    let result = await appViewModel.checkForUpdates();
    if (showInfo) {
      if (result == null || result.isUpdateAvailable == false) {
        alert("You are using the latest available app version. You should also regularly check soundshed.com for updates and news.");
      } else {
        alert("There is a new app version available.");
      }
    }
  };

  return (
    <div className="about-intro">

      {/* ── Hero ── */}
      <div className="about-hero">
        <div className="about-shimmer-badge">Soundshed Control</div>
        <h1 className="about-heading">
          Your Amp. Your way.
        </h1>
        <p className="about-sub">
          A desktop &amp; web UI for managing your Positive Grid Spark amp —
          tones, backing tracks, scales and MIDI control, all in one place.
        </p>
        <div className="about-links">
          <a href="#" className="about-link-pill" onClick={(e) => openLink(e, "https://soundshed.com")} aria-label="soundshed.com (opens externally)">
            soundshed.com ↗
          </a>
          <a href="#" className="about-link-pill" onClick={(e) => openLink(e, "https://github.com/soundshed/soundshed-app/discussions")} aria-label="Community discussions (opens externally)">
            Community discussions ↗
          </a>
        </div>
      </div>

      {/* ── Version card ── */}
      <div className="about-version-card glass-panel">
        {isWebMode === false ? (
          appUpdateAvailable ? (
            <div className="about-update-banner">
              <span className="about-update-icon">⬆</span>
              <span>A new version is available — updating is recommended.</span>
              <button className="btn btn-primary btn-sm" onClick={(e) => openLink(e, "https://soundshed.com")}>
                Download Update
              </button>
            </div>
          ) : (
            <div className="about-version-row">
              <span className="version-chip">
                {appInfo?.name} {appInfo?.version}
              </span>
              <button className="btn btn-sm btn-secondary" onClick={() => checkForUpdates(true)}>
                Check for Updates
              </button>
            </div>
          )
        ) : (
          <div className="about-version-row">
            <span className="version-chip">{env.Version} · Web</span>
          </div>
        )}
      </div>

      {/* ── Credits ── */}
      <div className="about-credits glass-panel">
        <h3 className="about-credits-heading">Credits</h3>
        <ul className="about-credits-list">
          <li>
            Spark comms based on{" "}
            <a href="#" onClick={(e) => openLink(e, "https://github.com/paulhamsh/Spark-Parser")} aria-label="paulhamsh/Spark-Parser on GitHub (opens externally)">
              paulhamsh/Spark-Parser
            </a>
          </li>
          <li>
            Preset info adapted from{" "}
            <a href="#" onClick={(e) => openLink(e, "https://github.com/richtamblyn/PGSparkLite")} aria-label="richtamblyn/PGSparkLite on GitHub (opens externally)">
              richtamblyn/PGSparkLite
            </a>
          </li>
          <li>Burning Guitar photo — Dark Rider on Unsplash</li>
          <li>Pedal Board photo — Jarrod Reed on Unsplash</li>
          <li>Wooden Pedal Board photo — Luana Azevedo on Unsplash</li>
          <li>Soundshed Control by Christopher Cook</li>
        </ul>
      </div>

    </div>
  );
};

export default AboutControl;
