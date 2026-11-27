import React from "react";

// Desktop rotary knob for the amp screen. Plain SVG + pointer events so it needs
// no webaudio-controls custom element and can be driven from tests in jsdom.
//
// Values are always 0..1 (the amp's parameter range). Every change is reported
// through onChange with a phase:
//  - "live":   while the user is still moving the knob (drag, wheel, held key).
//              Throttled per knob to one call per LIVE_THROTTLE_MS, latest wins.
//  - "commit": the final value of a gesture (pointer up, single key press, wheel
//              idle, double-click reset, typed entry). Always sent, never dropped.

/** Minimum gap between "live" onChange calls of one knob. */
export const LIVE_THROTTLE_MS = 40;
/** How long the wheel must be idle before its gesture is committed. */
export const WHEEL_COMMIT_MS = 150;
/** Vertical drag distance (px) that sweeps the full 0..1 range. */
export const DRAG_FULL_RANGE_PX = 200;

const FINE_FACTOR = 0.1;
const STEP = 0.01;
const PAGE_STEP = 0.1;
const WHEEL_STEP = 0.01;
const WHEEL_FINE_STEP = 0.001;

// The dial sweeps 270 degrees, from 7:30 (min) to 4:30 (max), like most amps.
const START_ANGLE = -135;
const SWEEP = 270;

export type KnobChangePhase = "live" | "commit";

export interface AmpKnobProps {
  /** Current value, 0..1. Updates from outside (MIDI CC, amp) move the knob unless it is being dragged. */
  value: number;
  /** Accessible name and caption, usually the parameter name. */
  label: string;
  onChange: (value: number, phase: KnobChangePhase) => void;
  /** Value restored by double-clicking the knob; null/undefined disables the reset. */
  defaultValue?: number | null;
  /** Dial diameter in px (default 96). */
  size?: number;
  disabled?: boolean;
  /** Readout and aria-valuetext; defaults to the amp-style 0.0-10.0 scale. */
  formatValue?: (value: number) => string;
  id?: string;
  className?: string;
  /** Only the dial: no readout, caption or typed entry (the caller shows them), and no 64 px minimum width. */
  compact?: boolean;
  /** Where the End key jumps to (default 1); null ignores End, e.g. for a volume that must never jump to full. */
  endValue?: number | null;
  /** Drag distance (px) that sweeps the full range (default DRAG_FULL_RANGE_PX). */
  dragRange?: number;
  /**
   * Also count horizontal drag (right raises), e.g. for a knob near the top of the
   * screen, where an upward drag soon runs out of room.
   */
  horizontalDrag?: boolean;
  /** Appended to the dial's tooltip, e.g. how to open a menu on it. */
  hint?: string;
  /** id of an element that describes the dial (aria-describedby). */
  describedBy?: string;
}

export const defaultKnobFormat = (value: number) => (value * 10).toFixed(1);

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

// Rounded to 4 places so repeated small steps don't accumulate float noise
// (0.1 + 0.01 * n) while still keeping the 0.001 fine wheel step exact.
const normalise = (v: number) => Math.round(clamp01(v) * 10000) / 10000;

const sanitise = (v: any) => (typeof v == "number" && Number.isFinite(v) ? normalise(v) : 0);

const polar = (angleDeg: number, r: number) => {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  return { x: 50 + r * Math.cos(a), y: 50 + r * Math.sin(a) };
};

const arcPath = (fromDeg: number, toDeg: number, r: number) => {
  const start = polar(fromDeg, r);
  const end = polar(toDeg, r);
  const largeArc = toDeg - fromDeg > 180 ? 1 : 0;
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
};

const AmpKnob = ({
  value,
  label,
  onChange,
  defaultValue = null,
  size = 96,
  disabled = false,
  formatValue = defaultKnobFormat,
  id,
  className,
  compact = false,
  endValue = 1,
  dragRange = DRAG_FULL_RANGE_PX,
  horizontalDrag = false,
  hint,
  describedBy,
}: AmpKnobProps) => {
  const [display, setDisplay] = React.useState(() => sanitise(value));
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [dragging, setDragging] = React.useState(false);

  const dialRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Handlers read the latest value/callback through refs so the native wheel
  // listener (attached once) never sees stale props.
  const valueRef = React.useRef(display);
  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;

  // Throttle / gesture bookkeeping.
  const lastLiveAt = React.useRef(-Infinity);
  const pendingLive = React.useRef<number | null>(null);
  const liveTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const wheelTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const uncommitted = React.useRef(false);
  const drag = React.useRef<{ pointerId: number; lastX: number; lastY: number } | null>(null);
  const keyRepeating = React.useRef(false);
  const cancelEdit = React.useRef(false);

  const isInteracting = () => drag.current != null || wheelTimer.current != null || keyRepeating.current;

  // Follow external changes, except mid-gesture where the amp echo (or a lagging
  // store) would fight the user's hand.
  React.useEffect(() => {
    if (isInteracting()) return;
    const next = sanitise(value);
    valueRef.current = next;
    setDisplay(next);
  }, [value]);

  const show = (v: number) => {
    valueRef.current = v;
    setDisplay(v);
  };

  const flushLive = () => {
    liveTimer.current = null;
    const v = pendingLive.current;
    if (v == null) return;
    pendingLive.current = null;
    lastLiveAt.current = Date.now();
    onChangeRef.current(v, "live");
  };

  const sendLive = (v: number) => {
    uncommitted.current = true;
    pendingLive.current = v;
    if (liveTimer.current != null) return; // already scheduled; latest value wins
    const wait = LIVE_THROTTLE_MS - (Date.now() - lastLiveAt.current);
    if (wait <= 0) flushLive();
    else liveTimer.current = setTimeout(flushLive, wait);
  };

  const commit = (v: number) => {
    if (liveTimer.current != null) clearTimeout(liveTimer.current);
    if (wheelTimer.current != null) clearTimeout(wheelTimer.current);
    liveTimer.current = null;
    wheelTimer.current = null;
    pendingLive.current = null;
    uncommitted.current = false;
    onChangeRef.current(v, "commit");
  };

  /** Moves the knob; returns false when the value did not change. */
  const setLive = (raw: number) => {
    const v = normalise(raw);
    if (v == valueRef.current) return false;
    show(v);
    sendLive(v);
    return true;
  };

  const setCommitted = (raw: number) => {
    const v = normalise(raw);
    if (v == valueRef.current && !uncommitted.current) return;
    show(v);
    commit(v);
  };

  // A pending live value or wheel gesture still owes the parent a commit; send it
  // rather than losing the user's last move when the inspector switches blocks.
  React.useEffect(
    () => () => {
      const owed = uncommitted.current;
      if (liveTimer.current != null) clearTimeout(liveTimer.current);
      if (wheelTimer.current != null) clearTimeout(wheelTimer.current);
      liveTimer.current = null;
      wheelTimer.current = null;
      pendingLive.current = null;
      uncommitted.current = false;
      if (owed) onChangeRef.current(valueRef.current, "commit");
    },
    []
  );

  // ---- wheel: native, non-passive listener so preventDefault stops page scroll

  const disabledRef = React.useRef(disabled);
  disabledRef.current = disabled;

  React.useEffect(() => {
    const el = dialRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (disabledRef.current) return;
      // Shift+wheel is turned into horizontal scrolling by some platforms.
      const delta = e.deltaY != 0 ? e.deltaY : e.deltaX;
      if (delta == 0) return;
      e.preventDefault();
      const step = e.shiftKey ? WHEEL_FINE_STEP : WHEEL_STEP;
      setLive(valueRef.current + (delta < 0 ? step : -step));
      if (wheelTimer.current != null) clearTimeout(wheelTimer.current);
      wheelTimer.current = setTimeout(() => {
        wheelTimer.current = null;
        if (uncommitted.current) commit(valueRef.current);
      }, WHEEL_COMMIT_MS);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // ---- drag

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || editing || e.button != 0) return;
    e.preventDefault(); // no text selection while dragging
    dialRef.current?.focus();
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      // jsdom and some synthetic pointers have no capture support
    }
    drag.current = { pointerId: e.pointerId, lastX: e.clientX, lastY: e.clientY };
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || e.pointerId != d.pointerId) return;
    // Incremental, so pressing/releasing the fine modifier mid-drag never jumps.
    // Up raises; with horizontalDrag, right raises too.
    const dy = d.lastY - e.clientY;
    const dx = horizontalDrag ? e.clientX - d.lastX : 0;
    d.lastX = e.clientX;
    d.lastY = e.clientY;
    const moved = dx + dy;
    if (moved == 0) return;
    const fine = e.shiftKey || e.metaKey || e.ctrlKey;
    const delta = (moved / (dragRange > 0 ? dragRange : DRAG_FULL_RANGE_PX)) * (fine ? FINE_FACTOR : 1);
    // Unrounded so slow fine drags (< 0.0001 per event) still accumulate.
    const v = clamp01(valueRef.current + delta);
    if (v == valueRef.current) return;
    valueRef.current = v;
    setDisplay(v);
    sendLive(normalise(v));
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || e.pointerId != d.pointerId) return;
    drag.current = null;
    setDragging(false);
    try {
      e.currentTarget.releasePointerCapture?.(e.pointerId);
    } catch {
      // see onPointerDown
    }
    const v = normalise(valueRef.current);
    show(v);
    if (uncommitted.current) commit(v);
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    if (disabled || defaultValue == null) return;
    e.preventDefault();
    setCommitted(defaultValue);
  };

  // ---- keyboard

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled || e.altKey || e.metaKey || e.ctrlKey) return;
    const mult = e.shiftKey ? 10 : 1;
    const v = valueRef.current;
    let next: number | null = null;
    switch (e.key) {
      case "ArrowUp":
      case "ArrowRight":
        next = v + STEP * mult;
        break;
      case "ArrowDown":
      case "ArrowLeft":
        next = v - STEP * mult;
        break;
      case "PageUp":
        next = v + PAGE_STEP;
        break;
      case "PageDown":
        next = v - PAGE_STEP;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        if (endValue == null) return;
        next = endValue;
        break;
      case "Enter":
        if (compact) return;
        e.preventDefault();
        e.stopPropagation();
        startEdit();
        return;
      default:
        return;
    }
    // Handled here: keep the screen's block navigation (arrows) from also firing.
    e.preventDefault();
    e.stopPropagation();
    if (e.repeat) {
      // Held key: stream like a drag and commit on key up.
      keyRepeating.current = true;
      setLive(next);
    } else {
      setCommitted(next);
    }
  };

  // Ends a held-key gesture. Besides the dial's own keyup this runs on dial blur,
  // window blur and any document keyup: a key released after focus has moved on
  // (Tab, Enter into the value field, a click, Cmd+Tab) never reaches the dial, and
  // a stuck gesture would make the knob ignore every external update from then on.
  const endKeyRepeat = () => {
    if (!keyRepeating.current) return;
    keyRepeating.current = false;
    if (uncommitted.current) commit(valueRef.current);
  };

  React.useEffect(() => {
    const end = () => endKeyRepeat();
    window.addEventListener("blur", end);
    document.addEventListener("keyup", end);
    return () => {
      window.removeEventListener("blur", end);
      document.removeEventListener("keyup", end);
    };
  }, []);

  // ---- typed entry (0-10 amp scale)

  const startEdit = () => {
    if (disabled || compact) return;
    cancelEdit.current = false;
    setDraft((valueRef.current * 10).toFixed(1));
    setEditing(true);
  };

  React.useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const finishEdit = (apply: boolean, refocus: boolean) => {
    setEditing(false);
    if (apply) {
      // Out-of-range entries clamp; anything unparsable is ignored.
      const n = parseFloat(draft.replace(",", "."));
      if (Number.isFinite(n)) setCommitted(Math.min(10, Math.max(0, n)) / 10);
    }
    // After Enter/Esc keep the keyboard flow on the knob; after a blur the user
    // has moved elsewhere, so leave focus alone.
    if (refocus) dialRef.current?.focus();
  };

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key == "Enter") {
      e.preventDefault();
      e.stopPropagation();
      cancelEdit.current = true; // the blur that follows must not apply twice
      finishEdit(true, true);
    } else if (e.key == "Escape") {
      e.preventDefault();
      e.stopPropagation();
      cancelEdit.current = true;
      finishEdit(false, true);
    }
  };

  const onInputBlur = () => {
    if (cancelEdit.current) return;
    finishEdit(true, false);
  };

  // ---- render

  const text = formatValue(display);
  const angle = START_ANGLE + display * SWEEP;
  const tip = polar(angle, 30);
  const inner = polar(angle, 12);

  const classes = ["amp-knob"];
  if (disabled) classes.push("amp-knob--disabled");
  if (dragging) classes.push("amp-knob--dragging");
  if (horizontalDrag) classes.push("amp-knob--xy");
  if (className) classes.push(className);

  return (
    <div className={classes.join(" ")} style={{ width: compact ? size : Math.max(size, 64) }}>
      <div
        ref={dialRef}
        id={id}
        className="amp-knob__dial"
        style={{ width: size, height: size }}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={1}
        aria-valuenow={Math.round(display * 1000) / 1000}
        aria-valuetext={text}
        aria-disabled={disabled || undefined}
        aria-describedby={describedBy}
        title={`${label}: ${text}${defaultValue != null ? " (double-click to reset)" : ""}${hint ? `. ${hint}` : ""}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
        onDoubleClick={onDoubleClick}
        onKeyDown={onKeyDown}
        onKeyUp={endKeyRepeat}
        onBlur={endKeyRepeat}
      >
        <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true" focusable="false">
          <path className="amp-knob__track" d={arcPath(START_ANGLE, START_ANGLE + SWEEP, 44)} />
          {display > 0.0005 && <path className="amp-knob__arc" d={arcPath(START_ANGLE, angle, 44)} />}
          <circle className="amp-knob__body" cx="50" cy="50" r="35" />
          <circle className="amp-knob__cap" cx="50" cy="50" r="27" />
          <line
            className="amp-knob__pointer"
            x1={inner.x.toFixed(2)}
            y1={inner.y.toFixed(2)}
            x2={tip.x.toFixed(2)}
            y2={tip.y.toFixed(2)}
          />
        </svg>
      </div>

      {compact ? null : editing ? (
        <input
          ref={inputRef}
          className="amp-knob__input"
          type="text"
          inputMode="decimal"
          aria-label={`${label} value (0 to 10)`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onInputKeyDown}
          onBlur={onInputBlur}
        />
      ) : (
        <span
          className="amp-knob__value"
          data-testid="amp-knob-value"
          title="Double-click to type a value"
          onDoubleClick={startEdit}
        >
          {text}
        </span>
      )}
      {!compact && <span className="amp-knob__label">{label}</span>}
    </div>
  );
};

export default AmpKnob;
