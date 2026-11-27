import React from "react";

// "?" popover listing the amp screen's keyboard shortcuts.

const isMac = typeof navigator != "undefined" && /mac/i.test(navigator.platform ?? "");
const MOD = isMac ? "⌘" : "Ctrl";

export const DESK_SHORTCUTS: ReadonlyArray<{ keys: string; action: string }> = [
  { keys: "1 – 8", action: "Select channel (keyboard mappings in Settings)" },
  { keys: "← / →  or  [ / ]", action: "Previous / next block" },
  { keys: "Space", action: "Switch the selected block on/off" },
  { keys: "M  or  Enter on a block", action: "Change model" },
  { keys: `/  or  ${MOD}+F`, action: "Search models" },
  { keys: `${MOD}+S`, action: "Save to amp" },
  { keys: "↑ ↓ / wheel", action: "Adjust the focused knob (Shift: fine / ×10)" },
  { keys: "Double-click knob", action: "Reset to the model default" },
  { keys: "Enter on a knob", action: "Type a value (0–10)" },
  { keys: "Esc", action: "Close popovers" },
  { keys: "?", action: "Show this help" },
];

const ShortcutsHelp = ({ onClose }: { onClose: () => void }) => {
  const closeRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    closeRef.current?.focus();
  }, []);

  return (
    <div
      className="amp-desk-popover amp-desk-help"
      role="dialog"
      aria-label="Keyboard shortcuts"
      onKeyDown={(e) => {
        if (e.key == "Escape") {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="amp-desk-help__header">
        <p className="amp-desk-popover__title">Keyboard shortcuts</p>
        <button ref={closeRef} type="button" className="amp-desk-browser__close" aria-label="Close shortcuts" onClick={onClose}>
          ×
        </button>
      </div>
      <dl className="amp-desk-help__list">
        {DESK_SHORTCUTS.map((s) => (
          <React.Fragment key={s.keys}>
            <dt>
              <kbd>{s.keys}</kbd>
            </dt>
            <dd>{s.action}</dd>
          </React.Fragment>
        ))}
      </dl>
    </div>
  );
};

export default ShortcutsHelp;
