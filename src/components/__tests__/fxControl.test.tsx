// @vitest-environment jsdom
import React from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import "../../testing/componentTestSetup";
import { FxCatalogProvider } from "../../spork/src/devices/spark/sparkFxCatalog";
import ModelBrowser from "../device/desk/model-browser";
import { buildDeskBlocks, DeskBlock, filterModels, modelsForSlot } from "../device/desk/desk-model";

// The model browser replaced the per-block <select>. These keep the select's
// guarantees (Hendrix, unknown and removed models stay usable, the current model is
// always listed) and cover search, categories, keyboard and apply.

const catalog = FxCatalogProvider.getFxCatalog();
const AMP_SLOT = 3;
const P = "pg.spark40.";

const toneWith = (slotIndex: number, dspId: string) => {
  const fx = ["bias.noisegate", "Compressor", "Booster", "Twin", "ChorusAnalog", "DelayMono", "bias.reverb.0"].map((id) => ({
    type: P + id,
    name: "",
    enabled: true,
    params: [],
  }));
  fx[slotIndex] = { type: dspId, name: "", enabled: true, params: [] };
  return { name: "Test", fx } as any;
};

const blockFor = (dspId: string, slotIndex = AMP_SLOT): DeskBlock => buildDeskBlocks(toneWith(slotIndex, dspId), catalog)[slotIndex];

const renderBrowser = (dspId: string, opts: { onApply?: any; onClose?: any; slotIndex?: number } = {}) => {
  const onApply = opts.onApply ?? vi.fn().mockResolvedValue(true);
  const onClose = opts.onClose ?? vi.fn();
  render(<ModelBrowser block={blockFor(dspId, opts.slotIndex)} catalog={catalog} onApply={onApply} onClose={onClose} />);
  return { onApply, onClose };
};

const options = () => screen.getAllByRole("option");
const optionNames = () => options().map((o) => o.querySelector(".amp-desk-card__name")?.textContent);
const currentOption = () => options().find((o) => o.getAttribute("aria-current") == "true");
const search = () => screen.getByRole("combobox", { name: "Search models" });

describe("model lists", () => {
  // Reported from real use: with a Jimi Hendrix expansion amp on the amp, the amp
  // block's model list was empty, so no other amp could be chosen.
  it.each(["JH.DualShowman", "JH.Sunn100", "JH.Bassman50Silver", "JH.SoundCity100"])(
    "lists the amps when the current amp is %s",
    (dspId) => {
      const ids = modelsForSlot(catalog, "amp", P + dspId).map((m) => m.dspId);

      expect(ids).toEqual(
        expect.arrayContaining([P + "Twin", P + "JH.JTM45", P + "JH.SuperLead100", P + dspId, P + "JH.SoundCity100"])
      );
      expect(modelsForSlot(catalog, "amp", P + dspId).filter((m) => m.isCurrent)).toHaveLength(1);
    }
  );

  it("still lists the amps for a model the catalog does not know yet, using the slot", () => {
    const block = blockFor(P + "JH.SomeFutureAmp");
    expect(block.slot.type).toBe("amp");

    const models = modelsForSlot(catalog, block.slot.type, block.fx!.type);
    expect(models[0]).toMatchObject({ dspId: P + "JH.SomeFutureAmp", isCurrent: true });
    expect(models.map((m) => m.dspId)).toContain(P + "Twin");
  });

  it("keeps showing a removed model that is still on the amp, once", () => {
    const models = modelsForSlot(catalog, "amp", P + "JCM800");

    expect(models.filter((m) => m.dspId == P + "JCM800")).toHaveLength(1);
    expect(models.find((m) => m.dspId == P + "JCM800")).toMatchObject({ isCurrent: true, isRemoved: true });
  });

  it("hides removed models that are not on the amp", () => {
    const removed = catalog.catalog.filter((c) => c.type == "amp" && c.isRemoved).map((c) => c.dspId);
    expect(removed.length).toBeGreaterThan(0);

    const ids = modelsForSlot(catalog, "amp", P + "Twin").map((m) => m.dspId);
    for (const id of removed) expect(ids).not.toContain(id);
  });

  it("only offers models of the slot's type", () => {
    const drives = modelsForSlot(catalog, "drive", P + "Booster");
    expect(drives.length).toBeGreaterThan(3);
    for (const m of drives) {
      expect(catalog.catalog.find((c) => c.dspId == m.dspId)?.type).toBe("drive");
    }
  });

  it("searches the model name, the gear it is inspired by and the category", () => {
    const amps = modelsForSlot(catalog, "amp", P + "Twin");
    const twin = amps.find((m) => m.dspId == P + "Twin")!;

    expect(filterModels(amps, twin.name.toLowerCase(), null).map((m) => m.dspId)).toContain(P + "Twin");
    if (twin.info.inspiredBy) {
      expect(filterModels(amps, twin.info.inspiredBy.toUpperCase(), null).map((m) => m.dspId)).toContain(P + "Twin");
    }
    const highGain = filterModels(amps, "high gain", null);
    expect(highGain.length).toBeGreaterThan(0);
    expect(highGain.every((m) => m.info.category == "High Gain" || `${m.name} ${m.info.inspiredBy}`.toLowerCase().includes("high"))).toBe(true);
    expect(filterModels(amps, "zzzz-no-such-model", null)).toHaveLength(0);
  });
});

describe("model browser", () => {
  it("focuses the search box and marks the current model", () => {
    renderBrowser(P + "Twin");

    expect(search()).toHaveFocus();
    expect(currentOption()).toBeDefined();
    expect(within(currentOption()!).getByText("Current")).toBeInTheDocument();
    expect(currentOption()).toHaveAttribute("aria-selected", "true");
  });

  it("represents a Hendrix amp as the current model", () => {
    renderBrowser(P + "JH.DualShowman");

    expect(currentOption()?.id).toBeTruthy();
    expect(optionNames()).toEqual(expect.arrayContaining([catalog.catalog.find((c) => c.dspId == P + "Twin")!.name]));
  });

  it("represents an unknown model on the amp", () => {
    renderBrowser(P + "SomethingUnknown");

    expect(within(currentOption()!).getByText("SomethingUnknown")).toBeInTheDocument();
  });

  it("filters as you type", async () => {
    const user = userEvent.setup();
    renderBrowser(P + "Twin");
    const before = options().length;

    await user.type(search(), "twin");

    expect(options().length).toBeLessThan(before);
    expect(options().length).toBeGreaterThan(0);
    for (const o of options()) expect(o.textContent!.toLowerCase()).toContain("twin");
  });

  it("filters by category chip", async () => {
    const user = userEvent.setup();
    renderBrowser(P + "Twin");

    await user.click(screen.getByRole("button", { name: "Bass" }));

    expect(screen.getByRole("button", { name: "Bass" })).toHaveAttribute("aria-pressed", "true");
    const bassIds = modelsForSlot(catalog, "amp", P + "Twin").filter((m) => m.info.category == "Bass");
    expect(options()).toHaveLength(bassIds.length);
  });

  it("applies the highlighted model with the arrow keys and Enter", async () => {
    const user = userEvent.setup();
    const { onApply, onClose } = renderBrowser(P + "Twin");
    const all = modelsForSlot(catalog, "amp", P + "Twin");
    const currentIndex = all.findIndex((m) => m.isCurrent);

    await user.keyboard("{ArrowDown}{Enter}");

    expect(onApply).toHaveBeenCalledWith(all[currentIndex + 1].dspId);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("applies a model on double-click", async () => {
    const user = userEvent.setup();
    const { onApply } = renderBrowser(P + "Twin");
    const target = options().find((o) => o.getAttribute("aria-current") != "true")!;

    await user.dblClick(target);

    expect(onApply).toHaveBeenCalledTimes(1);
  });

  it("just closes when the current model is chosen again", async () => {
    const user = userEvent.setup();
    const { onApply, onClose } = renderBrowser(P + "Twin");

    await user.keyboard("{Enter}");

    expect(onApply).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("shows an inline error and stays open when the change fails", async () => {
    const user = userEvent.setup();
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    const { onClose } = renderBrowser(P + "Twin", { onApply: vi.fn().mockResolvedValue(false) });

    await user.keyboard("{ArrowDown}{Enter}");

    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't switch/i);
    expect(onClose).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it("closes on Escape without applying", () => {
    const { onApply, onClose } = renderBrowser(P + "Twin");

    fireEvent.keyDown(search(), { key: "Escape" });

    expect(onClose).toHaveBeenCalled();
    expect(onApply).not.toHaveBeenCalled();
  });

  it("keeps Left/Right in the search box from reaching the screen's block navigation", () => {
    const onWindowKey = vi.fn();
    window.addEventListener("keydown", onWindowKey);
    renderBrowser(P + "Twin");

    act(() => {
      fireEvent.keyDown(search(), { key: "ArrowRight" });
    });

    expect(onWindowKey).not.toHaveBeenCalled();
    window.removeEventListener("keydown", onWindowKey);
  });
});
