import React from "react";
import {
  EventTargetMapping,
  FxOnOffMode,
  InputEventMapping,
  MidiEventSource,
  MIDI_CHANNEL_ANY,
  ValueCurve,
} from "../../../spork/src/interfaces/inputEventMapping";
import { AppStateStore } from "../../../stores/appstate";
import { DeviceStateStore } from "../../../stores/devicestate";
import { MidiStateStore } from "../../../stores/midistate";
import { midiMappingController, NO_INPUT_LISTENED_HINT } from "../../../core/midiMappingController";
import {
  describeEvent,
  describeSource,
  FxTargetOption,
  HEEL_THRESHOLD,
  listFxTargets,
  MIDI_MAX_VALUE,
  newMappingId,
} from "../../../core/midiMapping";
import {
  buildMixerMapping,
  describeMixerTarget,
  isMixerTargetType,
  MIXER_MIDI_CHANNELS,
} from "../../../core/mixerMidiTargets";

/*
 * MIDI learn and continuous control mappings (expression pedals, knobs, footswitches).
 * Styled with the existing settings classes plus inline styles only.
 */

const controlStyle: React.CSSProperties = {
  background: "var(--bg-elevated, #1c1c1c)",
  color: "var(--text, #eee)",
  border: "1px solid var(--border, #333)",
  borderRadius: 6,
  padding: "0.2em 0.4em",
  fontSize: "0.78rem",
};

const labelStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.35rem",
  fontSize: "0.75rem",
  color: "var(--text-muted, #aaa)",
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "0.6rem",
};

const CHANNELS = Array.from({ length: 16 }, (_, i) => (i + 1).toString());

export const ValueMeter = ({ value, label }: { value: number | null | undefined; label?: string }) => {
  const pct = value == null ? 0 : Math.round((value / MIDI_MAX_VALUE) * 100);
  return (
    <div
      role="meter"
      aria-label={label ?? "MIDI value"}
      aria-valuemin={0}
      aria-valuemax={MIDI_MAX_VALUE}
      aria-valuenow={value ?? 0}
      title={value == null ? "No input yet" : value.toString()}
      style={{
        position: "relative",
        width: 120,
        height: 8,
        borderRadius: 4,
        background: "rgba(255,255,255,0.08)",
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          width: pct + "%",
          height: "100%",
          background: "var(--accent, #f59e0b)",
          transition: "width 60ms linear",
        }}
      />
    </div>
  );
};

const describeTarget = (target: EventTargetMapping, fxTargets: FxTargetOption[], catalog: any): string => {
  if (target == null) return "";
  if (target.type === "amp-channel") return `Amp channel ${parseInt(target.value ?? "0") + 1}`;
  if (isMixerTargetType(target.type)) return describeMixerTarget(target);
  if (target.type === "fx-param" || target.type === "fx-onoff") {
    const live = fxTargets.find((f) => f.dspId === target.dspId);
    const def = catalog?.catalog?.find((c) => c.dspId === target.dspId);
    const fxName = live?.name ?? def?.name ?? target.dspId?.replace("pg.spark40.", "") ?? "?";
    const missing = live ? "" : " (not in current preset)";
    if (target.type === "fx-onoff") return `${fxName} on/off${missing}`;
    const paramName =
      live?.params.find((p) => p.index === target.paramIndex)?.name ??
      def?.params?.find((p) => p.index === target.paramIndex)?.name ??
      `Param ${(target.paramIndex ?? 0) + 1}`;
    return `${fxName} · ${paramName}${missing}`;
  }
  return target.type;
};

const MappingEditor = ({
  mapping,
  fxTargets,
  catalog,
  midiInputNames,
  isLearning,
  liveValue,
}: {
  mapping: InputEventMapping;
  fxTargets: FxTargetOption[];
  catalog: any;
  midiInputNames: string[];
  isLearning: boolean;
  liveValue: number | undefined;
}) => {
  const source = mapping.source as MidiEventSource;
  const target = mapping.target;
  const patchSource = (p: Partial<MidiEventSource>) => midiMappingController.patchMapping(mapping.id, { source: p });
  const patchTarget = (p: Partial<EventTargetMapping>) => midiMappingController.patchMapping(mapping.id, { target: p });

  const deviceOptions = Array.from(new Set([...midiInputNames, ...(source.deviceId ? [source.deviceId] : [])]));

  return (
    <div className="mapping-row" style={{ flexDirection: "column", alignItems: "stretch", gap: "0.45rem" }}>
      <div style={rowStyle}>
        <span className="mapping-name" title={mapping.name}>{mapping.name}</span>
        <span className="mapping-cell mapping-code" title={describeSource(source)}>
          {isLearning ? <em>Listening…</em> : describeSource(source)}
        </span>
        <span className="mapping-cell" title={describeTarget(target, fxTargets, catalog)}>
          {describeTarget(target, fxTargets, catalog)}
        </span>
        <ValueMeter value={liveValue} label={`${mapping.name} input value`} />
        <div className="mapping-actions">
          {isLearning ? (
            <button className="settings-btn" onClick={() => midiMappingController.cancelLearn()}>
              Cancel
            </button>
          ) : (
            <button className="settings-btn settings-btn--accent" onClick={() => midiMappingController.startLearn([mapping.id])}>
              Learn
            </button>
          )}
          <button
            className="settings-btn settings-btn--muted"
            aria-label={`Delete ${mapping.name}`}
            onClick={() => midiMappingController.removeMapping(mapping.id)}
          >
            Delete
          </button>
        </div>
      </div>

      <div style={rowStyle}>
        <label style={labelStyle}>
          Input
          <select
            style={controlStyle}
            value={source.deviceId ?? ""}
            onChange={(e) => patchSource({ deviceId: e.target.value || undefined })}
          >
            <option value="">Any input</option>
            {deviceOptions.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
        <label style={labelStyle}>
          Channel
          <select
            style={controlStyle}
            value={source.kind == null ? MIDI_CHANNEL_ANY : source.channel ?? MIDI_CHANNEL_ANY}
            disabled={source.kind == null}
            onChange={(e) => patchSource({ channel: e.target.value })}
          >
            <option value={MIDI_CHANNEL_ANY}>Any</option>
            {CHANNELS.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>

        {(target.type === "fx-param" || target.type === "mixer-volume") && (
          <>
            <label style={labelStyle}>
              Min
              <input
                type="number" min={0} max={1} step={0.01} style={{ ...controlStyle, width: 64 }}
                value={target.min ?? 0}
                onChange={(e) => patchTarget({ min: clamp01(parseFloat(e.target.value)) })}
              />
            </label>
            <label style={labelStyle}>
              Max
              <input
                type="number" min={0} max={1} step={0.01} style={{ ...controlStyle, width: 64 }}
                value={target.max ?? 1}
                onChange={(e) => patchTarget({ max: clamp01(parseFloat(e.target.value)) })}
              />
            </label>
            <label style={labelStyle}>
              <input type="checkbox" checked={target.invert == true} onChange={(e) => patchTarget({ invert: e.target.checked })} />
              Invert
            </label>
            <label style={labelStyle}>
              Curve
              <select style={controlStyle} value={target.curve ?? "linear"} onChange={(e) => patchTarget({ curve: e.target.value as ValueCurve })}>
                <option value="linear">Linear</option>
                <option value="log">Log</option>
              </select>
            </label>
          </>
        )}

        {(target.type === "fx-onoff" || target.type === "mixer-mute") && (
          <>
            <label style={labelStyle}>
              Mode
              <select style={controlStyle} value={target.mode ?? "toggle"} onChange={(e) => patchTarget({ mode: e.target.value as FxOnOffMode })}>
                {/* for a mute, "on" means muted */}
                {target.type === "mixer-mute" ? (
                  <>
                    <option value="toggle">Toggle mute on press</option>
                    <option value="momentary">Momentary (muted while held)</option>
                    <option value="threshold">Threshold (muted above value)</option>
                  </>
                ) : (
                  <>
                    <option value="toggle">Toggle on press</option>
                    <option value="momentary">Momentary (on while held)</option>
                    <option value="threshold">Threshold (on above value)</option>
                  </>
                )}
              </select>
            </label>
            {target.mode === "threshold" && (
              <label style={labelStyle}>
                Threshold
                <input
                  type="number" min={1} max={127} step={1} style={{ ...controlStyle, width: 64 }}
                  value={target.threshold ?? 64}
                  onChange={(e) => patchTarget({ threshold: Math.min(127, Math.max(1, parseInt(e.target.value) || 1)) })}
                />
              </label>
            )}
          </>
        )}
      </div>
    </div>
  );
};

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

type NewTargetType = "fx-param" | "fx-onoff" | "amp-channel" | "mixer-volume" | "mixer-mute";

/** Target types chosen from the current preset's effects. */
const isFxTargetType = (t: NewTargetType) => t === "fx-param" || t === "fx-onoff";

const MidiMappingPanel = () => {
  // control mappings are a separate list from the legacy "Input Event Mappings" table
  const controlMappings: InputEventMapping[] = AppStateStore.useState((s) => s.midiControlMappings);
  const isMidiInputAvailable: boolean = AppStateStore.useState((s) => s.isMidiInputAvailable);
  const midiInputs: any[] = AppStateStore.useState((s) => s.midiInputs);
  const listenAll: boolean = AppStateStore.useState((s) => s.midiListenAllInputs);
  const numPresetSlots: number = AppStateStore.useState((s) => s.numPresetSlots);
  const presetTone = DeviceStateStore.useState((s) => s.presetTone);
  const fxCatalog = DeviceStateStore.useState((s) => s.fxCatalog);
  const lastEvent = MidiStateStore.useState((s) => s.lastEvent);
  const lastValues = MidiStateStore.useState((s) => s.lastValues);
  const learningIds = MidiStateStore.useState((s) => s.learningMappingIds);
  const learnStatus = MidiStateStore.useState((s) => s.learnStatus);

  const fxTargets = React.useMemo(() => listFxTargets(presetTone, fxCatalog), [presetTone, fxCatalog]);
  const midiInputNames = (midiInputs ?? []).map((i) => i.name);
  const mappings = controlMappings ?? [];

  const [newType, setNewType] = React.useState<NewTargetType>("fx-param");
  const [newFx, setNewFx] = React.useState<string>("");
  const [newParam, setNewParam] = React.useState<number>(0);
  const [newChannel, setNewChannel] = React.useState<number>(0);
  const [newMixerChannel, setNewMixerChannel] = React.useState<number>(MIXER_MIDI_CHANNELS[0].channel);
  const [wahAutoEnable, setWahAutoEnable] = React.useState(true);
  const [presetMessage, setPresetMessage] = React.useState<string>(null);

  const selectedFx = fxTargets.find((f) => f.dspId === newFx) ?? fxTargets[0];

  React.useEffect(() => {
    // keep the selection valid when the preset changes
    if (selectedFx && selectedFx.dspId !== newFx) setNewFx(selectedFx.dspId);
    if (selectedFx && !selectedFx.params.some((p) => p.index === newParam)) setNewParam(selectedFx.params[0]?.index ?? 0);
  }, [selectedFx, newFx, newParam]);

  const canAdd = !isFxTargetType(newType) || selectedFx != null;

  const addMapping = () => {
    if (!canAdd) return;
    if (isMixerTargetType(newType)) {
      // needs no amp to set up; it only acts while one is connected
      const mixerMapping = buildMixerMapping(newType, newMixerChannel);
      midiMappingController.addMappings([mixerMapping]);
      midiMappingController.startLearn([mixerMapping.id]);
      return;
    }
    const source: MidiEventSource = { type: "midi", kind: "cc", code: "", channel: MIDI_CHANNEL_ANY };
    let target: EventTargetMapping;
    let name: string;
    if (newType === "amp-channel") {
      target = { type: "amp-channel", value: newChannel.toString() };
      name = `MIDI → Amp channel ${newChannel + 1}`;
    } else if (newType === "fx-onoff") {
      target = { type: "fx-onoff", dspId: selectedFx.dspId, mode: "toggle", threshold: HEEL_THRESHOLD };
      name = `MIDI → ${selectedFx.name} on/off`;
    } else {
      const param = selectedFx.params.find((p) => p.index === newParam) ?? selectedFx.params[0];
      target = { type: "fx-param", dspId: selectedFx.dspId, paramIndex: param?.index ?? 0, min: 0, max: 1, invert: false, curve: "linear" };
      name = `MIDI → ${selectedFx.name} ${param?.name ?? ""}`.trim();
    }
    const mapping: InputEventMapping = { id: newMappingId(), name, source, target };
    midiMappingController.addMappings([mapping]);
    midiMappingController.startLearn([mapping.id]);
  };

  const addWahPreset = () => {
    const result = midiMappingController.addExpressionWahPreset(wahAutoEnable);
    setPresetMessage(result.message);
  };

  return (
    <div className="settings-section glass-panel" data-testid="midi-mapping-panel">
      <div className="settings-section-header">
        <div>
          <h2 className="settings-section-title">MIDI Learn &amp; Continuous Control</h2>
          <p className="settings-section-desc">
            Map expression pedals, knobs and footswitches (CC, notes or program changes) to effect parameters and on/off switches of the current preset, or to the amp&apos;s Guitar / Music volume and mute (experimental, only while an amp is connected).
          </p>
        </div>
      </div>

      <div style={{ ...rowStyle, marginBottom: "0.75rem" }}>
        <label style={labelStyle}>
          <input
            type="checkbox"
            checked={listenAll == true}
            onChange={(e) => midiMappingController.setListenAllInputs(e.target.checked)}
          />
          Listen to all MIDI inputs
        </label>
        <span className="settings-section-desc">
          {midiInputNames.length} input{midiInputNames.length == 1 ? "" : "s"} detected
        </span>
        <span style={{ ...labelStyle, marginLeft: "auto" }}>
          Incoming:
          <span className="mapping-code" aria-live="polite">{lastEvent ? describeEvent(lastEvent) : "—"}</span>
          <ValueMeter value={lastEvent?.value} label="Last incoming MIDI value" />
        </span>
      </div>

      {!isMidiInputAvailable && (
        <p className="settings-empty" role="note" style={{ marginTop: 0, marginBottom: "0.75rem" }}>
          {NO_INPUT_LISTENED_HINT} Learn needs a listened input.
        </p>
      )}

      {learnStatus && (
        <div className="settings-active-chip" role="status" style={{ marginTop: 0, marginBottom: "0.75rem" }}>
          <span className="settings-chip-dot" />
          {learnStatus}
          {learningIds.length > 0 && (
            <button className="settings-btn" style={{ marginLeft: "0.5rem" }} onClick={() => midiMappingController.cancelLearn()}>
              Cancel
            </button>
          )}
        </div>
      )}

      <div style={{ ...rowStyle, marginBottom: "0.75rem" }}>
        <button
          className="settings-btn settings-btn--accent"
          onClick={addWahPreset}
          title="The Spark wah (Vox 846) is an auto-wah with no pedal-position parameter; the pedal is mapped to its Sensitivity."
        >
          Expression pedal → Wah sensitivity
        </button>
        <label style={labelStyle}>
          <input type="checkbox" checked={wahAutoEnable} onChange={(e) => setWahAutoEnable(e.target.checked)} />
          Switch the wah on when the pedal leaves heel position
        </label>
        {presetMessage && <span className="settings-section-desc">{presetMessage}</span>}
      </div>

      <div style={{ ...rowStyle, marginBottom: "0.75rem" }}>
        <label style={labelStyle}>
          Target
          <select style={controlStyle} value={newType} onChange={(e) => setNewType(e.target.value as NewTargetType)}>
            <option value="fx-param">Effect parameter</option>
            <option value="fx-onoff">Effect on/off</option>
            <option value="amp-channel">Amp channel</option>
            <option value="mixer-volume">Amp volume</option>
            <option value="mixer-mute">Amp mute</option>
          </select>
        </label>

        {isFxTargetType(newType) && (
          fxTargets.length === 0 ? (
            <span className="settings-empty">Connect to the amp to choose effects from the current preset.</span>
          ) : (
            <label style={labelStyle}>
              Effect
              <select style={controlStyle} value={selectedFx?.dspId ?? ""} onChange={(e) => setNewFx(e.target.value)}>
                {fxTargets.map((f) => (
                  <option key={f.dspId} value={f.dspId}>{f.name}</option>
                ))}
              </select>
            </label>
          )
        )}

        {newType === "fx-param" && selectedFx && (
          <label style={labelStyle}>
            Parameter
            <select style={controlStyle} value={newParam} onChange={(e) => setNewParam(parseInt(e.target.value))}>
              {selectedFx.params.map((p) => (
                <option key={p.index} value={p.index}>{p.name}</option>
              ))}
            </select>
          </label>
        )}

        {newType === "amp-channel" && (
          <label style={labelStyle}>
            Channel
            <select style={controlStyle} value={newChannel} onChange={(e) => setNewChannel(parseInt(e.target.value))}>
              {Array.from({ length: numPresetSlots ?? 4 }, (_, i) => (
                <option key={i} value={i}>{i + 1}</option>
              ))}
            </select>
          </label>
        )}

        {isMixerTargetType(newType) && (
          <label style={labelStyle}>
            Mixer channel
            <select style={controlStyle} value={newMixerChannel} onChange={(e) => setNewMixerChannel(parseInt(e.target.value))}>
              {MIXER_MIDI_CHANNELS.map((c) => (
                <option key={c.channel} value={c.channel}>{c.label}</option>
              ))}
            </select>
          </label>
        )}

        <button className="settings-btn settings-btn--accent" disabled={!canAdd} onClick={addMapping}>
          Add &amp; Learn
        </button>
      </div>

      {mappings.length > 0 ? (
        <div className="mapping-table">
          {mappings.map((m) => (
            <MappingEditor
              key={m.id}
              mapping={m}
              fxTargets={fxTargets}
              catalog={fxCatalog}
              midiInputNames={midiInputNames}
              isLearning={learningIds.includes(m.id)}
              liveValue={lastValues[m.id]}
            />
          ))}
        </div>
      ) : (
        <p className="settings-empty">No MIDI control mappings yet.</p>
      )}
    </div>
  );
};

export default MidiMappingPanel;
