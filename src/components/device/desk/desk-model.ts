// Pure helpers behind the amp screen: turning the current tone into the seven
// chain blocks, and the model list / search used by the model browser. Kept free
// of React so they can be unit tested and shared by the desk components.

import { Tone, ToneFx } from "../../../core/soundshedApi";
import { FxModelInfo, FxSlotType, getModelInfo } from "../../../core/fxModelInfo";
import { FxCatalog, FxCatalogItem } from "../../../spork/src/interfaces/preset";

export const DSP_ID_PREFIX = "pg.spark40.";

export interface DeskSlot {
  type: FxSlotType;
  /** Short label shown on the tile, e.g. "Mod" */
  label: string;
}

// A Spark preset always has gate, comp, drive, amp, mod, delay and reverb in that
// order, which matches the fx catalog type indexes.
export const DESK_SLOTS: readonly DeskSlot[] = [
  { type: "gate", label: "Gate" },
  { type: "comp", label: "Comp" },
  { type: "drive", label: "Drive" },
  { type: "amp", label: "Amp" },
  { type: "modulation", label: "Mod" },
  { type: "delay", label: "Delay" },
  { type: "reverb", label: "Reverb" },
];

export const AMP_SLOT_INDEX = 3;

export interface DeskBlock {
  slotIndex: number;
  slot: DeskSlot;
  /** null when the preset has nothing in this slot */
  fx: ToneFx | null;
  catalogItem: FxCatalogItem | null;
  info: FxModelInfo;
  /** Model name to show (catalog name, else the tone's name, else the bare id) */
  name: string;
}

export const isEmptyFx = (fx: ToneFx | null | undefined) => !fx || !fx.type || fx.type == DSP_ID_PREFIX;

export const stripDspPrefix = (dspId: string | null | undefined) =>
  dspId?.startsWith(DSP_ID_PREFIX) ? dspId.substring(DSP_ID_PREFIX.length) : dspId ?? "";

export function findCatalogItem(catalog: FxCatalog | null | undefined, dspId: string | null | undefined): FxCatalogItem | null {
  if (!catalog || !dspId) return null;
  return (
    catalog.catalog.find((c) => c.dspId == dspId) ??
    catalog.catalog.find((c) => c.dspId == DSP_ID_PREFIX + dspId) ??
    null
  );
}

const makeBlock = (slotIndex: number, fx: ToneFx | null, catalog: FxCatalog | null | undefined): DeskBlock => {
  const slot = DESK_SLOTS[slotIndex];
  if (isEmptyFx(fx)) {
    return { slotIndex, slot, fx: null, catalogItem: null, info: getModelInfo(null, slot.type), name: "Empty" };
  }
  const catalogItem = findCatalogItem(catalog, fx.type);
  return {
    slotIndex,
    slot,
    fx,
    catalogItem,
    // Unknown ids (e.g. a newer expansion pack) take the type of the slot they sit in.
    info: getModelInfo(fx.type, slot.type),
    name: catalogItem?.name ?? (fx.name || stripDspPrefix(fx.type)),
  };
};

/**
 * The seven chain blocks for a tone. A normal Spark preset maps one-to-one by position;
 * anything else is placed by the catalog type of each fx, with unplaceable ones filling
 * the remaining gaps so nothing on the amp is hidden.
 */
export function buildDeskBlocks(tone: Tone | null | undefined, catalog: FxCatalog | null | undefined): DeskBlock[] {
  const fxList: ToneFx[] = tone?.fx ?? [];

  if (fxList.length == DESK_SLOTS.length) {
    return fxList.map((fx, i) => makeBlock(i, fx, catalog));
  }

  const placed: (ToneFx | null)[] = DESK_SLOTS.map(() => null);
  const leftovers: ToneFx[] = [];
  for (const fx of fxList) {
    if (isEmptyFx(fx)) continue;
    const type = findCatalogItem(catalog, fx.type)?.type ?? getModelInfo(fx.type).type;
    const index = DESK_SLOTS.findIndex((s) => s.type == type);
    if (index >= 0 && placed[index] == null) placed[index] = fx;
    else leftovers.push(fx);
  }
  for (const fx of leftovers) {
    const gap = placed.findIndex((p) => p == null);
    if (gap < 0) break;
    placed[gap] = fx;
  }
  return placed.map((fx, i) => makeBlock(i, fx, catalog));
}

/** Whether the tone has any block worth showing. */
export const hasSignalChain = (tone: Tone | null | undefined) => (tone?.fx ?? []).some((fx) => !isEmptyFx(fx));

// ---- model browser

export interface DeskModelOption {
  dspId: string;
  name: string;
  info: FxModelInfo;
  isCurrent: boolean;
  /** Removed from the catalog; only ever listed when it is the current model */
  isRemoved: boolean;
  isExperimental: boolean;
}

/**
 * Models that can go in a slot, sorted by name. Removed models are hidden, but the model
 * currently on the amp is always listed (first, if it would otherwise be missing) so the
 * browser never shows an empty list or hides what is actually playing.
 */
export function modelsForSlot(
  catalog: FxCatalog | null | undefined,
  slotType: FxSlotType,
  currentDspId: string | null | undefined
): DeskModelOption[] {
  const toOption = (c: FxCatalogItem): DeskModelOption => ({
    dspId: c.dspId,
    name: c.name,
    info: getModelInfo(c.dspId, slotType),
    isCurrent: currentDspId != null && stripDspPrefix(c.dspId) == stripDspPrefix(currentDspId),
    isRemoved: c.isRemoved == true,
    isExperimental: c.isExperimental == true,
  });

  let list = (catalog?.catalog ?? [])
    .filter((c) => c.type == slotType && c.isRemoved != true)
    .map(toOption)
    .sort((a, b) => a.name.localeCompare(b.name));

  if (currentDspId && currentDspId != DSP_ID_PREFIX && !list.some((m) => m.isCurrent)) {
    const known = findCatalogItem(catalog, currentDspId);
    const current: DeskModelOption = known
      ? { ...toOption(known), dspId: currentDspId, isCurrent: true }
      : {
          dspId: currentDspId,
          name: stripDspPrefix(currentDspId),
          info: getModelInfo(currentDspId, slotType),
          isCurrent: true,
          isRemoved: false,
          isExperimental: false,
        };
    list = [current, ...list];
  }
  return list;
}

/**
 * Filters by category chip (null = all) and a free-text query. Every word of the query
 * must appear in the model name, the gear it is inspired by, its category or its id.
 */
export function filterModels(models: DeskModelOption[], query: string, category: string | null): DeskModelOption[] {
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 0);
  return models.filter((m) => {
    if (category != null && m.info.category != category) return false;
    if (words.length == 0) return true;
    const haystack = [m.name, m.info.inspiredBy ?? "", m.info.category, stripDspPrefix(m.dspId)].join(" ").toLowerCase();
    return words.every((w) => haystack.includes(w));
  });
}

/** Param display name: the tone's, else the catalog's, else "Param N". */
export function paramName(block: DeskBlock, paramId: string | number, toneName?: string): string {
  if (toneName) return toneName;
  const index = Number(paramId);
  return block.catalogItem?.params?.find((p) => p.index == index)?.name ?? `Param ${index + 1}`;
}

/** Catalog default for a param, or null when the catalog has none. */
export function paramDefault(block: DeskBlock, paramId: string | number): number | null {
  const index = Number(paramId);
  const v = block.catalogItem?.params?.find((p) => p.index == index)?.value;
  return typeof v == "number" && Number.isFinite(v) ? v : null;
}
