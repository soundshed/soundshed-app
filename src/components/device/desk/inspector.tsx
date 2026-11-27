import React from "react";
import { getParamKind, getSwitchLabels, TRADEMARK_DISCLAIMER } from "../../../core/fxModelInfo";
import { openLink } from "../../../core/platformUtils";
import AmpKnob, { KnobChangePhase } from "./amp-knob";
import { INSPECTOR_PANEL_ID, tabIdFor } from "./chain-strip";
import { DeskBlock, paramDefault, paramName } from "./desk-model";
import FxImage from "./fx-image";

// Editor for the selected chain block: a large image and model details on the
// left, every param as a big knob (or a two-position switch) on the right. The
// model browser is passed in as children and overlays this panel, so the chain
// stays visible while choosing a model.

interface InspectorProps {
  block: DeskBlock | null;
  onParamChange: (block: DeskBlock, paramIndex: number, value: number, phase: KnobChangePhase) => void;
  onToggle: (block: DeskBlock) => void;
  onOpenBrowser: () => void;
  /** Overlay content (the model browser) */
  children?: React.ReactNode;
}

interface ParamSwitchProps {
  label: string;
  value: number;
  offLabel: string;
  onLabel: string;
  onChange: (value: number) => void;
}

const ParamSwitch = ({ label, value, offLabel, onLabel, onChange }: ParamSwitchProps) => {
  const on = value >= 0.5;
  return (
    <div className="amp-desk-switch">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        className={`amp-desk-switch__button ${on ? "is-on" : "is-off"}`}
        title={`${label}: ${on ? onLabel : offLabel}`}
        onClick={() => onChange(on ? 0 : 1)}
      >
        <span className={`amp-desk-switch__pos ${on ? "" : "is-active"}`}>{offLabel}</span>
        <span className="amp-desk-switch__track" aria-hidden="true">
          <span className="amp-desk-switch__thumb" />
        </span>
        <span className={`amp-desk-switch__pos ${on ? "is-active" : ""}`}>{onLabel}</span>
      </button>
      <span className="amp-desk-switch__label">{label}</span>
    </div>
  );
};

const Inspector = ({ block, onParamChange, onToggle, onOpenBrowser, children }: InspectorProps) => {
  const panelProps = {
    id: INSPECTOR_PANEL_ID,
    role: "tabpanel",
    "data-desk-region": "inspector",
  };

  if (!block || !block.fx) {
    return (
      <section
        {...panelProps}
        className="amp-desk-inspector amp-desk-inspector--empty"
        aria-labelledby={block ? tabIdFor(block.slotIndex) : undefined}
      >
        <p className="amp-desk-inspector__empty">
          {block ? `The ${block.slot.label.toLowerCase()} slot is empty in this preset.` : "Select a block to edit it."}
        </p>
        {children}
      </section>
    );
  }

  const { fx, info, slot } = block;
  const enabled = fx.enabled == true;
  const params = [...(fx.params ?? [])].sort((a, b) => Number(a.paramId) - Number(b.paramId));
  const inspired = info.inspiredBy;
  const isExperimental = block.catalogItem?.isExperimental == true;

  return (
    <section
      {...panelProps}
      className={`amp-desk-inspector ${enabled ? "" : "amp-desk-inspector--off"}`}
      aria-labelledby={tabIdFor(block.slotIndex)}
    >
      <div className="amp-desk-inspector__model">
        <div className="amp-desk-inspector__image">
          <FxImage dspId={fx.type} slotType={slot.type} alt={block.name} placeholder={slot.label} />
        </div>
        <div className="amp-desk-inspector__details">
          <span className="amp-desk-inspector__slot">{slot.label}</span>
          <h2 className="amp-desk-inspector__name" title={block.name}>
            {block.name}
            {inspired && info.mappingSource == "inferred" && (
              <span
                className="amp-desk-inspector__hint"
                title={`Possibly inspired by ${inspired}. ${TRADEMARK_DISCLAIMER}`}
                aria-label={`Possibly inspired by ${inspired}`}
                role="note"
              >
                ⓘ
              </span>
            )}
          </h2>
          {inspired && info.mappingSource == "official" && (
            <p className="amp-desk-inspector__inspired" title={TRADEMARK_DISCLAIMER}>
              Inspired by {inspired}
            </p>
          )}
          {isExperimental && (
            <span className="amp-desk-inspector__badge" title="Experimental FX – may not work.">
              ⚠ Experimental
            </span>
          )}
          <div className="amp-desk-inspector__actions">
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              aria-label={`${slot.label} on`}
              className={`amp-desk-power ${enabled ? "is-on" : "is-off"}`}
              title="Switch this block on or off (Space)"
              onClick={() => onToggle(block)}
            >
              <span className="amp-desk-power__led" aria-hidden="true" />
              {enabled ? "On" : "Off"}
            </button>
            <button
              type="button"
              className="btn btn-sm btn-secondary"
              title="Choose another model (M)"
              onClick={onOpenBrowser}
            >
              Change model…
            </button>
          </div>
          {info.referenceUrl && (
            <a
              href={info.referenceUrl}
              className="amp-desk-inspector__reference"
              title={
                info.referenceMatch == "approximate"
                  ? "Photo of similar gear on Wikimedia Commons (opens externally)"
                  : "Photo on Wikimedia Commons (opens externally)"
              }
              onClick={(e) => openLink(e, info.referenceUrl)}
            >
              Reference photo ↗
            </a>
          )}
        </div>
      </div>

      <div className="amp-desk-inspector__params" role="group" aria-label={`${block.name} controls`}>
        {params.length == 0 && <p className="amp-desk-inspector__empty">This model has no adjustable controls.</p>}
        {params.map((p) => {
          const index = Number(p.paramId);
          const name = paramName(block, p.paramId, p.name);
          const value = Number(p.value);
          if (getParamKind(fx.type, index) == "switch") {
            const labels = getSwitchLabels(fx.type, index) ?? { off: "Off", on: "On" };
            return (
              <ParamSwitch
                key={`${fx.type}:${index}`}
                label={name}
                value={Number.isFinite(value) ? value : 0}
                offLabel={labels.off}
                onLabel={labels.on}
                onChange={(v) => onParamChange(block, index, v, "commit")}
              />
            );
          }
          return (
            <AmpKnob
              key={`${fx.type}:${index}`}
              value={value}
              label={name}
              size={params.length > 5 ? 92 : 120}
              defaultValue={paramDefault(block, index)}
              onChange={(v, phase) => onParamChange(block, index, v, phase)}
            />
          );
        })}
      </div>

      {children}
    </section>
  );
};

export default Inspector;
