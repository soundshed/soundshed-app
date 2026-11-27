import React from "react";
import { FX_MODEL_CATEGORIES, TRADEMARK_DISCLAIMER } from "../../../core/fxModelInfo";
import { FxCatalog } from "../../../spork/src/interfaces/preset";
import { DeskBlock, DeskModelOption, filterModels, modelsForSlot } from "./desk-model";
import FxImage from "./fx-image";

// Model picker for one chain block. It overlays the inspector (not a modal), so the
// chain stays visible. Typing filters straight away; arrows move through the grid,
// Enter or a double-click applies, Esc closes.

interface ModelBrowserProps {
  block: DeskBlock;
  catalog: FxCatalog | null | undefined;
  /** Resolves false when the amp rejected the change; the browser then stays open with an error. */
  onApply: (dspIdNew: string) => Promise<boolean>;
  onClose: () => void;
  /**
   * Focus the search box on mount (default). Pass false when the browser only
   * remounts because the selected block changed, so keyboard focus stays on the
   * chain tab and ←/→ keep moving along the chain.
   */
  autoFocusSearch?: boolean;
}

const LIST_ID = "amp-desk-model-list";
const optionId = (index: number) => `amp-desk-model-${index}`;

const ModelBrowser = ({ block, catalog, onApply, onClose, autoFocusSearch = true }: ModelBrowserProps) => {
  const slotType = block.slot.type;
  const currentDspId = block.fx?.type ?? null;

  const models = React.useMemo(() => modelsForSlot(catalog, slotType, currentDspId), [catalog, slotType, currentDspId]);

  // Only offer chips that have models behind them.
  const categories = React.useMemo(
    () => (FX_MODEL_CATEGORIES[slotType] ?? []).filter((c) => models.some((m) => m.info.category == c)),
    [models, slotType]
  );

  const [query, setQuery] = React.useState("");
  const [category, setCategory] = React.useState<string | null>(null);
  const [active, setActive] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);

  const visible = React.useMemo(() => filterModels(models, query, category), [models, query, category]);

  // A new filter starts on the current model if it is visible, else on the first match.
  React.useEffect(() => {
    const current = visible.findIndex((m) => m.isCurrent);
    setActive(current >= 0 ? current : 0);
  }, [visible]);

  React.useEffect(() => {
    if (autoFocusSearch) inputRef.current?.focus();
  }, []);

  React.useEffect(() => {
    const el = document.getElementById(optionId(active));
    el?.scrollIntoView?.({ block: "nearest" });
  }, [active]);

  const columns = () => {
    const options = listRef.current?.querySelectorAll<HTMLElement>('[role="option"]');
    if (!options || options.length == 0) return 1;
    const first = options[0];
    if (!first.offsetWidth) return 1; // not laid out (tests): treat as a single column
    let n = 0;
    for (const o of Array.from(options)) {
      if (o.offsetTop != first.offsetTop) break;
      n++;
    }
    return Math.max(1, n);
  };

  const move = (delta: number) => {
    if (visible.length == 0) return;
    setActive((a) => Math.min(visible.length - 1, Math.max(0, a + delta)));
  };

  const apply = async (option: DeskModelOption | undefined) => {
    if (!option || busy) return;
    if (option.isCurrent) {
      onClose();
      return;
    }
    setError(null);
    setBusy(true);
    let ok = false;
    try {
      ok = await onApply(option.dspId);
    } catch {
      ok = false;
    }
    setBusy(false);
    if (ok) {
      onClose();
    } else {
      setError(`Couldn't switch to ${option.name}. The model may have been removed, or the amp is not connected.`);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const inSearch = target == inputRef.current;
    const inList = target == listRef.current;
    let handled = true;

    switch (e.key) {
      case "Escape":
        onClose();
        break;
      case "Enter":
        if (inSearch || inList) void apply(visible[active]);
        else handled = false;
        break;
      case "ArrowDown":
        if (inSearch || inList) move(columns());
        else handled = false;
        break;
      case "ArrowUp":
        if (inSearch || inList) move(-columns());
        else handled = false;
        break;
      case "ArrowRight":
        // In the search box Left/Right keep moving the text cursor.
        if (inList) move(1);
        else handled = false;
        break;
      case "ArrowLeft":
        if (inList) move(-1);
        else handled = false;
        break;
      case "Home":
        if (inList) setActive(0);
        else handled = false;
        break;
      case "End":
        if (inList) setActive(Math.max(0, visible.length - 1));
        else handled = false;
        break;
      default:
        handled = false;
    }

    // Keep the screen's shortcuts (block navigation, Esc) from acting on these too.
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
    } else if (e.key.startsWith("Arrow") || e.key == "[" || e.key == "]") {
      e.stopPropagation();
    }
  };

  const activeId = visible.length > 0 ? optionId(active) : undefined;

  return (
    <div
      className="amp-desk-browser"
      role="dialog"
      aria-label={`Choose ${block.slot.label} model`}
      data-testid="model-browser"
      onKeyDown={onKeyDown}
    >
      <div className="amp-desk-browser__header">
        {/* Combobox pattern: focus stays in the box while ↑↓ move the active option,
            so the option is announced through aria-activedescendant on the input. */}
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          className="amp-desk-browser__search"
          aria-label="Search models"
          aria-expanded={true}
          aria-controls={LIST_ID}
          aria-autocomplete="list"
          aria-activedescendant={activeId}
          placeholder={`Search ${block.slot.label.toLowerCase()} models, gear or category…`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="amp-desk-browser__chips" role="group" aria-label="Categories">
          <button
            type="button"
            className={`amp-desk-chip ${category == null ? "is-active" : ""}`}
            aria-pressed={category == null}
            onClick={() => setCategory(null)}
          >
            All
          </button>
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              className={`amp-desk-chip ${category == c ? "is-active" : ""}`}
              aria-pressed={category == c}
              onClick={() => setCategory(category == c ? null : c)}
            >
              {c}
            </button>
          ))}
        </div>
        <button type="button" className="amp-desk-browser__close" aria-label="Close model browser" title="Close (Esc)" onClick={onClose}>
          ×
        </button>
      </div>

      {error && (
        <p className="amp-desk-browser__error" role="alert">
          {error}
        </p>
      )}

      <div
        ref={listRef}
        id={LIST_ID}
        className="amp-desk-browser__grid"
        role="listbox"
        aria-label={`${block.slot.label} models`}
        aria-activedescendant={activeId}
        aria-busy={busy || undefined}
        tabIndex={0}
      >
        {visible.map((m, i) => {
          const classes = ["amp-desk-card"];
          if (i == active) classes.push("is-active");
          if (m.isCurrent) classes.push("is-current");
          return (
            <div
              key={m.dspId}
              id={optionId(i)}
              role="option"
              aria-selected={i == active}
              aria-current={m.isCurrent || undefined}
              className={classes.join(" ")}
              title={
                !m.info.inspiredBy || m.info.mappingSource == "none"
                  ? m.name
                  : m.info.mappingSource == "inferred"
                  ? `${m.name} – possibly inspired by ${m.info.inspiredBy}`
                  : `${m.name} – inspired by ${m.info.inspiredBy}`
              }
              onClick={() => setActive(i)}
              onDoubleClick={() => void apply(m)}
            >
              <span className="amp-desk-card__image">
                <FxImage dspId={m.dspId} slotType={slotType} alt="" placeholder={m.name.charAt(0)} />
              </span>
              <span className="amp-desk-card__name">{m.name}</span>
              {m.info.inspiredBy && m.info.mappingSource == "official" ? (
                <span className="amp-desk-card__inspired">Inspired by {m.info.inspiredBy}</span>
              ) : (
                <span className="amp-desk-card__inspired">{m.info.category}</span>
              )}
              {m.isCurrent && <span className="amp-desk-card__badge">Current</span>}
              {m.isRemoved && <span className="amp-desk-card__badge amp-desk-card__badge--warn">Removed</span>}
            </div>
          );
        })}
        {visible.length == 0 && <p className="amp-desk-browser__none">No models match “{query}”.</p>}
      </div>

      <div className="amp-desk-browser__footer">
        <span>
          {visible.length} of {models.length} · ↑↓ move · Enter apply · Esc close
        </span>
        <span className="amp-desk-browser__disclaimer">{TRADEMARK_DISCLAIMER}</span>
      </div>
    </div>
  );
};

export default ModelBrowser;
