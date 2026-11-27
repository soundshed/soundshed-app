import React from "react";
import type { RenameResult } from "../../../core/deviceViewModel";
import { PRESET_NAME_MAX_LENGTH, presetNameErrorText, validatePresetName } from "../../../core/presetName";

// "Rename tone" popover, opened from the ✎ button next to the tone name (or F2).
//
// The Spark protocol has no rename command. On a stored hardware channel a rename
// therefore stores the whole tone to that channel again under the new name (including
// any knob changes not yet saved), and the dialog says so. On a Live tone, or with no
// amp connected, only the name on screen changes; it goes to the amp with the next
// Save to Amp. Like the Save to Amp picker, it cannot be closed while it is saving.

/** Name input with its hint or error, shared with the Save to Amp picker. */
export interface PresetNameFieldProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  /** Show a validation error even if the length is fine (after a submit attempt) */
  showError: boolean;
  inputRef?: React.Ref<HTMLInputElement>;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

export const PresetNameField = ({ id, value, onChange, showError, inputRef, onKeyDown }: PresetNameFieldProps) => {
  const result = validatePresetName(value);
  const tooLong = value.trim().length > PRESET_NAME_MAX_LENGTH;
  const error = "error" in result && (showError || tooLong) ? result.error : null;
  const describedBy = `${id}-hint`;

  return (
    <div className="amp-desk-popover__field">
      <label htmlFor={id}>Name</label>
      <input
        ref={inputRef}
        id={id}
        type="text"
        maxLength={PRESET_NAME_MAX_LENGTH}
        autoComplete="off"
        spellCheck={false}
        value={value}
        aria-invalid={error != null}
        aria-describedby={describedBy}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
      />
      {error ? (
        <p id={describedBy} className="amp-desk-popover__field-error" role="alert">
          {presetNameErrorText(error)}
        </p>
      ) : (
        <p id={describedBy} className="amp-desk-popover__field-hint">
          Up to {PRESET_NAME_MAX_LENGTH} characters.{" "}
          <span className="amp-desk-popover__field-count">
            {value.trim().length}/{PRESET_NAME_MAX_LENGTH}
          </span>
        </p>
      )}
    </div>
  );
};

/** Enter that is not confirming an IME composition. */
export const isPlainEnter = (e: React.KeyboardEvent) =>
  e.key == "Enter" && !(e.nativeEvent as KeyboardEvent).isComposing && e.keyCode != 229;

interface RenamePresetPopoverProps {
  currentName: string;
  mode: "channel" | "local";
  /** 0-based hardware channel, only used in channel mode */
  channel: number;
  hasUnsavedEdits: boolean;
  /** Why the rename is local only: no amp, or a Live tone not stored on a channel */
  localReason?: "disconnected" | "live";
  /** Renames the tone on screen only; false when there is no tone to rename */
  onRenameLocal: (name: string) => boolean;
  onRenameChannel: (name: string) => Promise<RenameResult>;
  onClose: () => void;
}

type Step = "edit" | "saving" | "done";

const RenamePresetPopover = (props: RenamePresetPopoverProps) => {
  const { currentName, mode, channel, hasUnsavedEdits, localReason, onClose } = props;
  const [value, setValue] = React.useState(currentName ?? "");
  const [attempted, setAttempted] = React.useState(false);
  const [step, setStep] = React.useState<Step>("edit");
  const [result, setResult] = React.useState<RenameResult | null>(null);
  const [submittedName, setSubmittedName] = React.useState("");
  const [localFailed, setLocalFailed] = React.useState(false);

  const inputRef = React.useRef<HTMLInputElement>(null);
  const statusRef = React.useRef<HTMLParagraphElement>(null);
  const closeRef = React.useRef<HTMLButtonElement>(null);

  const n = channel + 1;

  // Each step replaces what had focus, so move focus on with it.
  React.useEffect(() => {
    if (step == "edit") {
      inputRef.current?.focus();
      inputRef.current?.select();
    } else if (step == "saving") {
      statusRef.current?.focus();
    } else {
      closeRef.current?.focus();
    }
  }, [step]);

  // Validates and returns the new name, or null when there is nothing to send:
  // an invalid name (shows the error) or an unchanged one (just closes).
  const checkedName = (): string | null => {
    setAttempted(true);
    const v = validatePresetName(value);
    if (!v.ok) {
      inputRef.current?.focus();
      return null;
    }
    if (v.name == (currentName ?? "").trim()) {
      onClose();
      return null;
    }
    return v.name;
  };

  const renameLocal = () => {
    const name = checkedName();
    if (name == null) return;
    if (props.onRenameLocal(name)) {
      onClose();
    } else {
      setLocalFailed(true);
    }
  };

  const renameChannel = async () => {
    const name = checkedName();
    if (name == null) return;
    setSubmittedName(name);
    setStep("saving");
    let r: RenameResult;
    try {
      r = await props.onRenameChannel(name);
    } catch {
      r = { ok: false, reason: "store-failed" };
    }
    setResult(r);
    setStep("done");
  };

  const submit = () => {
    if (step != "edit") return;
    if (mode == "channel") void renameChannel();
    else renameLocal();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key == "Escape") {
      e.preventDefault();
      e.stopPropagation();
      if (step != "saving") onClose();
      return;
    }
    if (e.target == inputRef.current) {
      // the desk's shortcuts (and channel digits) never see keys typed into the name
      e.stopPropagation();
      if (isPlainEnter(e)) {
        e.preventDefault();
        submit();
      }
    }
  };

  const doneMessage = () => {
    if (!result) return null;
    if (result.ok) {
      if (result.check == "confirmed") {
        return (
          <p className="amp-desk-popover__title amp-desk-popover__ok" role="status">
            Renamed channel {n} to “{submittedName}”.
          </p>
        );
      }
      if (result.check == "mismatch") {
        return (
          <p className="amp-desk-popover__title amp-desk-popover__error" role="alert">
            Saved, but the amp reports “{result.reportedName ?? ""}” on channel {n}.
          </p>
        );
      }
      return (
        <p className="amp-desk-popover__title amp-desk-popover__ok" role="status">
          Saved to channel {n}. The amp didn't report the name back.
        </p>
      );
    }
    if ("reason" in result && result.reason == "channel-changed") {
      return (
        <p className="amp-desk-popover__title amp-desk-popover__error" role="alert">
          The channel changed on the amp. Nothing was saved.
        </p>
      );
    }
    if ("reason" in result && result.reason == "not-loaded") {
      return (
        <p className="amp-desk-popover__title amp-desk-popover__error" role="alert">
          Channel {n} hasn't loaded from the amp yet. Nothing was saved.
        </p>
      );
    }
    return (
      <p className="amp-desk-popover__title amp-desk-popover__error" role="alert">
        Couldn't save to channel {n}. Check the amp connection and try again.
      </p>
    );
  };

  const canRetry = result != null && "reason" in result && result.reason != "channel-changed";

  return (
    <div
      className="amp-desk-popover amp-desk-rename"
      role="dialog"
      aria-label="Rename tone"
      data-testid="rename-popover"
      onKeyDown={onKeyDown}
    >
      {step == "edit" && (
        <>
          <p className="amp-desk-popover__title">{mode == "channel" ? `Rename channel ${n}` : "Rename tone"}</p>
          <PresetNameField
            id="amp-desk-rename-input"
            value={value}
            onChange={(v) => {
              setValue(v);
              setLocalFailed(false);
            }}
            showError={attempted}
            inputRef={inputRef}
          />
          {mode == "channel" ? (
            <>
              <p className="amp-desk-popover__note">Renaming saves this channel to the amp.</p>
              {hasUnsavedEdits && (
                <p className="amp-desk-popover__warn">
                  Channel {n} has changes that aren't saved on the amp. Renaming saves them too.
                </p>
              )}
            </>
          ) : (
            <p className="amp-desk-popover__note">
              {localReason == "disconnected"
                ? "No amp connected. The new name is used when you save it to the amp."
                : "This tone isn't stored on a channel. The new name is used when you save it to the amp."}
            </p>
          )}
          {localFailed && (
            <p className="amp-desk-popover__note amp-desk-popover__error" role="alert">
              Couldn't rename this tone.
            </p>
          )}
          <div className="amp-desk-popover__actions">
            <button type="button" className="btn btn-sm btn-primary" onClick={submit}>
              {mode == "channel" ? `Rename channel ${n}` : "Rename"}
            </button>
            {mode == "channel" && hasUnsavedEdits && (
              <button type="button" className="btn btn-sm btn-secondary" onClick={renameLocal}>
                Rename here only
              </button>
            )}
            <button type="button" className="btn btn-sm btn-secondary" onClick={onClose}>
              Cancel
            </button>
          </div>
        </>
      )}

      {step == "saving" && (
        <p ref={statusRef} className="amp-desk-popover__title" role="status" tabIndex={-1}>
          Saving channel {n}…
        </p>
      )}

      {step == "done" && (
        <>
          {doneMessage()}
          <div className="amp-desk-popover__actions">
            {canRetry && (
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                onClick={() => {
                  setResult(null);
                  setStep("edit");
                }}
              >
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

export default RenamePresetPopover;
