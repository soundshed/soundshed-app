import React from "react";

// "Save to Amp" popover: pick a hardware slot, confirm the overwrite, then show the
// result inline. Only real slots 1..numSlots are ever offered or sent; the virtual
// channel (0x7f) holds an applied tone and is not somewhere a save can go.
// While a save runs the picker cannot be closed (the screen ignores Esc and outside
// clicks too), so its result is always shown.

interface SaveSlotPickerProps {
  numSlots: number;
  /** Slot (0-based) to preselect, usually the current or last hardware channel */
  defaultSlot: number;
  toneName: string;
  /** Resolves false when the amp did not store the preset */
  onSave: (slot: number) => Promise<boolean>;
  onClose: () => void;
}

type Step = "choose" | "confirm" | "saving" | "done";

const isHardwareSlot = (slot: number, numSlots: number) => Number.isInteger(slot) && slot >= 0 && slot < numSlots;

const SaveSlotPicker = ({ numSlots, defaultSlot, toneName, onSave, onClose }: SaveSlotPickerProps) => {
  const [slot, setSlot] = React.useState(() => (isHardwareSlot(defaultSlot, numSlots) ? defaultSlot : 0));
  const [step, setStep] = React.useState<Step>("choose");
  const [saved, setSaved] = React.useState<boolean | null>(null);

  const rootRef = React.useRef<HTMLDivElement>(null);
  const confirmRef = React.useRef<HTMLButtonElement>(null);
  const statusRef = React.useRef<HTMLParagraphElement>(null);
  const closeRef = React.useRef<HTMLButtonElement>(null);

  // Each step replaces the focused button, so move focus on with it rather than
  // letting it fall to <body>.
  React.useEffect(() => {
    if (step == "choose") {
      rootRef.current?.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]')?.focus();
    } else if (step == "confirm") {
      confirmRef.current?.focus();
    } else if (step == "saving") {
      statusRef.current?.focus();
    } else {
      closeRef.current?.focus();
    }
  }, [step]);

  const chooseSlot = (next: number) => {
    setSlot(next);
    rootRef.current?.querySelectorAll<HTMLElement>('[role="radio"]')[next]?.focus();
  };

  const save = async () => {
    if (!isHardwareSlot(slot, numSlots) || step == "saving") return;
    setStep("saving");
    let ok = false;
    try {
      ok = await onSave(slot);
    } catch {
      ok = false;
    }
    setSaved(ok);
    setStep("done");
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key == "Escape") {
      e.preventDefault();
      e.stopPropagation();
      if (step != "saving") onClose();
      return;
    }
    if (step != "choose") return;
    if (e.key == "ArrowLeft" || e.key == "ArrowRight") {
      e.preventDefault();
      e.stopPropagation();
      chooseSlot(Math.min(numSlots - 1, Math.max(0, slot + (e.key == "ArrowRight" ? 1 : -1))));
    } else if (/^[1-9]$/.test(e.key) && !e.altKey && !e.ctrlKey && !e.metaKey) {
      // a digit picks that slot (the channel shortcuts ignore keys inside the picker)
      e.preventDefault();
      e.stopPropagation();
      const next = Number(e.key) - 1;
      if (next < numSlots) chooseSlot(next);
    }
  };

  const channel = slot + 1;

  return (
    <div
      ref={rootRef}
      className="amp-desk-popover amp-desk-save"
      role="dialog"
      aria-label="Save to amp"
      data-testid="save-slot-picker"
      onKeyDown={onKeyDown}
    >
      {step == "choose" && (
        <>
          <p className="amp-desk-popover__title" id="amp-desk-save-title">
            Save “{toneName}” to channel
          </p>
          <div className="amp-desk-save__slots" role="radiogroup" aria-labelledby="amp-desk-save-title">
            {Array.from({ length: numSlots }, (_, i) => (
              <button
                key={i}
                type="button"
                role="radio"
                aria-checked={slot == i}
                aria-label={`Slot ${i + 1}`}
                tabIndex={slot == i ? 0 : -1}
                className={`amp-desk-save__slot ${slot == i ? "is-active" : ""}`}
                onClick={() => setSlot(i)}
              >
                {i + 1}
              </button>
            ))}
          </div>
          <div className="amp-desk-popover__actions">
            <button type="button" className="btn btn-sm btn-primary" onClick={() => setStep("confirm")}>
              Save to channel {channel}…
            </button>
            <button type="button" className="btn btn-sm btn-secondary" onClick={onClose}>
              Cancel
            </button>
          </div>
        </>
      )}

      {step == "confirm" && (
        <>
          <p className="amp-desk-popover__title">
            Overwrite channel {channel} on the amp with “{toneName}”?
          </p>
          <p className="amp-desk-popover__note">What is stored on channel {channel} now will be replaced.</p>
          <div className="amp-desk-popover__actions">
            <button ref={confirmRef} type="button" className="btn btn-sm btn-primary" onClick={() => void save()}>
              Overwrite channel {channel}
            </button>
            <button type="button" className="btn btn-sm btn-secondary" onClick={() => setStep("choose")}>
              Back
            </button>
          </div>
        </>
      )}

      {step == "saving" && (
        <p ref={statusRef} className="amp-desk-popover__title" role="status" tabIndex={-1}>
          Saving to channel {channel}…
        </p>
      )}

      {step == "done" && (
        <>
          {saved ? (
            <p className="amp-desk-popover__title amp-desk-popover__ok" role="status">
              Saved to channel {channel}.
            </p>
          ) : (
            <p className="amp-desk-popover__title amp-desk-popover__error" role="alert">
              Couldn't save to channel {channel}. Check the amp connection and try again.
            </p>
          )}
          <div className="amp-desk-popover__actions">
            {!saved && (
              <button type="button" className="btn btn-sm btn-secondary" onClick={() => setStep("choose")}>
                Try again
              </button>
            )}
            <button ref={closeRef} type="button" className="btn btn-sm btn-secondary" onClick={onClose}>
              Close
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default SaveSlotPicker;
