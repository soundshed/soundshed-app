import { faVolumeHigh } from "@fortawesome/free-solid-svg-icons/faVolumeHigh";
import { faVolumeXmark } from "@fortawesome/free-solid-svg-icons/faVolumeXmark";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import React from "react";
import { createPortal } from "react-dom";
import { describeSource } from "../../../core/midiMapping";
import { midiMappingController } from "../../../core/midiMappingController";
import { describeMixerTarget, isMixerMapping, MixerTargetType } from "../../../core/mixerMidiTargets";
import { formatMixerValue, getMixerViewModel, MIXER_CHANNELS, MixerViewModel } from "../../../core/mixerViewModel";
import { InputEventMapping } from "../../../spork/src/interfaces/inputEventMapping";
import { AppStateStore } from "../../../stores/appstate";
import { DeviceStateStore } from "../../../stores/devicestate";
import { MidiStateStore } from "../../../stores/midistate";
import { IMixerChannelState, MixerStateStore } from "../../../stores/mixerstate";
import AmpKnob, { KnobChangePhase } from "../desk/amp-knob";

// Guitar / Music volume knobs and mute buttons at the right end of the nav bar, on
// every page. Rendered only while an amp is connected; nothing at all otherwise.
// They share MixerStateStore with the amp screen's mixer drawer, so both stay in sync.
//
// Right-clicking a knob or a mute button (or Shift+F10 / the context menu key on it,
// handled here as macOS doesn't turn them into a contextmenu event) opens a small
// "MIDI Learn" menu, like the webaudio-controls knobs' one: Learn re-assigns the
// control's mixer-volume / mixer-mute mapping (adding one if there is none) to the
// next MIDI control moved, Clear removes that control's mappings. The mappings are
// edited in Settings > MIDI Learn & Continuous Control.

export const NAV_KNOB_SIZE = 30;

/**
 * Drag distance for a full sweep of a nav knob. The knob sits at the top of the
 * window, so there is little room to drag up: right counts too, and the range is
 * half the amp desk's.
 */
export const NAV_KNOB_DRAG_RANGE_PX = 100;

const SEND_FAILED_HINT = "the last change did not reach the amp, try again";

const LEARN_HINT = "right-click or Shift+F10 for MIDI learn";

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** Keeps the learn menu this far inside the window. */
const MENU_MARGIN_PX = 8;
const MENU_WIDTH_PX = 220;

interface LearnMenuState {
  type: MixerTargetType;
  x: number;
  y: number;
  /** Focus goes back here when the menu closes from the keyboard. */
  trigger: HTMLElement | null;
}

/** Whether a key press asks for the context menu (Shift+F10 or the context menu key). */
const isMenuKey = (e: React.KeyboardEvent) =>
  !e.altKey && !e.ctrlKey && !e.metaKey && (e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey));

/** Where to open the menu: at the pointer, or under the control for a keyboard-opened one. */
const menuPosition = (e: React.MouseEvent<HTMLElement> | React.KeyboardEvent<HTMLElement>) => {
  let x = "clientX" in e ? e.clientX : 0;
  let y = "clientY" in e ? e.clientY : 0;
  if (x === 0 && y === 0) {
    const rect = e.currentTarget.getBoundingClientRect();
    x = rect.left;
    y = rect.bottom;
  }
  const maxX = (window.innerWidth || MENU_WIDTH_PX) - MENU_WIDTH_PX - MENU_MARGIN_PX;
  return { x: Math.max(MENU_MARGIN_PX, Math.min(x, maxX)), y: Math.max(MENU_MARGIN_PX, y) };
};

interface MixerLearnMenuProps {
  menu: LearnMenuState;
  channel: number;
  mappings: InputEventMapping[];
  learning: boolean;
  onClose: (restoreFocus: boolean) => void;
}

/** The "MIDI Learn" context menu of a nav knob or mute button, rendered into <body> (the nav's backdrop-filter would clip it). */
const MixerLearnMenu = ({ menu, channel, mappings, learning, onClose }: MixerLearnMenuProps) => {
  const ref = React.useRef<HTMLDivElement>(null);
  const what = describeMixerTarget({ type: menu.type, value: channel.toString() });

  React.useEffect(() => {
    ref.current?.querySelector<HTMLElement>("[role=menuitem]:not([disabled])")?.focus();
    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape" || e.key === "Tab") {
      e.preventDefault();
      onClose(true);
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = Array.from(ref.current?.querySelectorAll<HTMLElement>("[role=menuitem]:not([disabled])") ?? []);
    const index = items.indexOf(document.activeElement as HTMLElement);
    const next = (index + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
  };

  const act = (action: () => void) => () => {
    action();
    onClose(true);
  };

  return createPortal(
    <div
      ref={ref}
      className="nav-mixer-learn-menu"
      role="menu"
      aria-label={`MIDI learn: ${what}`}
      data-testid={`nav-mixer-learn-menu-${menu.type}-${channel}`}
      style={{ left: menu.x, top: menu.y, width: MENU_WIDTH_PX }}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="nav-mixer-learn-menu__title" aria-hidden="true">MIDI Learn · {what}</div>
      <div className="nav-mixer-learn-menu__mapped">
        {mappings.length === 0 ? "Not mapped" : mappings.map((m) => describeSource(m.source)).join(", ")}
      </div>
      {learning ? (
        <button type="button" role="menuitem" className="nav-mixer-learn-menu__item" onClick={act(() => midiMappingController.cancelLearn())}>
          Cancel learn
        </button>
      ) : (
        <button
          type="button"
          role="menuitem"
          className="nav-mixer-learn-menu__item"
          onClick={act(() => midiMappingController.learnMixerTarget(menu.type, channel))}
        >
          Learn
        </button>
      )}
      <button
        type="button"
        role="menuitem"
        className="nav-mixer-learn-menu__item"
        disabled={mappings.length === 0}
        onClick={act(() => midiMappingController.clearMixerTarget(menu.type, channel))}
      >
        Clear
      </button>
      <button type="button" role="menuitem" className="nav-mixer-learn-menu__item" onClick={() => onClose(true)}>
        Close
      </button>
    </div>,
    document.body
  );
};

interface NavMixerChannelProps {
  vm: MixerViewModel;
  channel: number;
  label: string;
  state: IMixerChannelState | undefined;
}

const NavMixerChannel = ({ vm, channel, label, state }: NavMixerChannelProps) => {
  const controlMappings: InputEventMapping[] = AppStateStore.useState((s) => s.midiControlMappings);
  const learningIds: string[] = MidiStateStore.useState((s) => s.learningMappingIds);
  const [menu, setMenu] = React.useState<LearnMenuState | null>(null);

  const mappingsFor = (type: MixerTargetType) => (controlMappings ?? []).filter((m) => isMixerMapping(m, type, channel));
  const volumeMappings = mappingsFor("mixer-volume");
  const muteMappings = mappingsFor("mixer-mute");
  const learningVolume = volumeMappings.some((m) => learningIds.includes(m.id));
  const learningMute = muteMappings.some((m) => learningIds.includes(m.id));

  const openMenu = (type: MixerTargetType) => (e: React.MouseEvent<HTMLElement> | React.KeyboardEvent<HTMLElement>) => {
    e.preventDefault();
    setMenu({ type, ...menuPosition(e), trigger: e.currentTarget.querySelector<HTMLElement>("[role=slider]") ?? e.currentTarget });
  };
  // preventDefault also keeps Chromium (Windows / Linux) from raising a contextmenu
  // event for the same key press
  const openMenuFromKey = (type: MixerTargetType) => (e: React.KeyboardEvent<HTMLElement>) => {
    if (isMenuKey(e)) openMenu(type)(e);
  };
  const closeMenu = (restoreFocus: boolean) => {
    const trigger = menu?.trigger;
    setMenu(null);
    if (restoreFocus) trigger?.focus();
  };

  const muted = !!state?.muted;
  const failed = !!state?.sendFailed;
  // While muted the knob shows the level unmuting goes back to, dimmed.
  const level = muted ? state?.unmuteValue ?? null : state?.value ?? null;
  const unknown = level == null;

  // A gesture's commit usually repeats its last live value; don't send that twice.
  const lastLive = React.useRef<number | null>(null);

  const onChange = (value: number, phase: KnobChangePhase) => {
    // The knob commits an unfinished gesture when it unmounts (on a disconnect).
    if (!DeviceStateStore.getRawState().isConnected) return;
    if (phase == "commit") {
      const repeat = lastLive.current === value;
      lastLive.current = null;
      if (repeat) return;
    } else {
      lastLive.current = value;
    }
    // Live values go out too: the view model keeps one send in flight per channel.
    void vm.setVolume(channel, value);
  };

  const formatValue = (value: number) =>
    unknown ? "unknown" : `${Math.round(value * 100)} %${muted ? " (muted)" : ""}`;

  const name = label.toLowerCase();

  const classes = ["nav-mixer__channel"];
  if (muted) classes.push("is-muted");
  if (failed) classes.push("is-error");

  const muteTitle = muted ? `${label} muted: click to restore its level` : `Mute ${name} (sets its level to 0)`;

  const learnHintId = `nav-mixer-learn-hint-${channel}`;

  const learningWhat = learningVolume ? `${label} volume` : learningMute ? `${label} mute` : null;

  return (
    <div
      className={classes.join(" ")}
      data-testid={`nav-mixer-${channel}`}
      title={`${label} ${formatMixerValue(level)}${muted ? " (muted)" : ""}${failed ? `: ${SEND_FAILED_HINT}` : ""}`}
    >
      {/* the dial fills this wrapper, so the hint goes on the dial's own tooltip */}
      <span
        className={`nav-mixer__learn-target${learningVolume ? " is-learning" : ""}`}
        onContextMenu={openMenu("mixer-volume")}
        onKeyDown={openMenuFromKey("mixer-volume")}
        data-testid={`nav-mixer-knob-${channel}`}
      >
        <AmpKnob
          compact
          horizontalDrag
          dragRange={NAV_KNOB_DRAG_RANGE_PX}
          size={NAV_KNOB_SIZE}
          label={`${label} volume`}
          value={level ?? 0}
          endValue={null}
          formatValue={formatValue}
          className="nav-mixer__knob"
          onChange={onChange}
          hint={learningVolume ? "Listening for MIDI…" : capitalise(LEARN_HINT)}
          describedBy={learnHintId}
        />
      </span>
      <span className="nav-mixer__text">
        <span className="nav-mixer__label">{label}</span>
        <span className="nav-mixer__value" data-testid={`nav-mixer-value-${channel}`}>
          {formatMixerValue(level)}
        </span>
      </span>
      <button
        type="button"
        className={`nav-mixer__mute${muted ? " is-muted" : ""}${learningMute ? " is-learning" : ""}`}
        aria-pressed={muted}
        aria-label={`Mute ${name}`}
        aria-describedby={learnHintId}
        title={
          learningMute
            ? `${label} mute: listening for MIDI…`
            : `${failed ? `${muteTitle}. ${label}: ${SEND_FAILED_HINT}.` : muteTitle} (${LEARN_HINT})`
        }
        onClick={() => void vm.toggleMute(channel)}
        onContextMenu={openMenu("mixer-mute")}
        onKeyDown={openMenuFromKey("mixer-mute")}
      >
        <FontAwesomeIcon icon={muted ? faVolumeXmark : faVolumeHigh} aria-hidden="true" />
      </button>
      <span className="visually-hidden" id={learnHintId}>
        Right-click or press Shift+F10 for the MIDI learn menu.
      </span>
      {/* always rendered, so screen readers announce the text when it appears */}
      <span className="visually-hidden" role="status" data-testid={`nav-mixer-error-${channel}`}>
        {failed ? `${label}: ${SEND_FAILED_HINT}` : ""}
      </span>
      <span className="visually-hidden" role="status" data-testid={`nav-mixer-learn-status-${channel}`}>
        {learningWhat ? `${learningWhat}: move a control or press a key on your MIDI device…` : ""}
      </span>
      {menu && (
        <MixerLearnMenu
          menu={menu}
          channel={channel}
          mappings={menu.type === "mixer-volume" ? volumeMappings : muteMappings}
          learning={menu.type === "mixer-volume" ? learningVolume : learningMute}
          onClose={closeMenu}
        />
      )}
    </div>
  );
};

interface GlobalMixerControlsProps {
  /** Injected in tests; the app uses the shared view model. */
  viewModel?: MixerViewModel;
}

const GlobalMixerControls = ({ viewModel }: GlobalMixerControlsProps) => {
  const connected: boolean = DeviceStateStore.useState((s) => s.isConnected);
  const channels = MixerStateStore.useState((s) => s.channels);

  if (!connected) return null;

  const vm = viewModel ?? getMixerViewModel();

  return (
    <div className="nav-mixer" role="group" aria-label="Amp volume" data-testid="nav-mixer">
      {MIXER_CHANNELS.map((c) => (
        <NavMixerChannel key={c.channel} vm={vm} channel={c.channel} label={c.label} state={channels[c.channel]} />
      ))}
    </div>
  );
};

export default GlobalMixerControls;
