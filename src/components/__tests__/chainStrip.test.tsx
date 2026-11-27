// @vitest-environment jsdom
import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "../../testing/componentTestSetup";
import { FxCatalogProvider } from "../../spork/src/devices/spark/sparkFxCatalog";
import ChainStrip, { tabIdFor } from "../device/desk/chain-strip";
import { AMP_SLOT_INDEX, DeskBlock, buildDeskBlocks } from "../device/desk/desk-model";

const P = "pg.spark40.";
const catalog = FxCatalogProvider.getFxCatalog();

const fx = (dspId: string, enabled = true) => ({ type: P + dspId, name: dspId, enabled, params: [] });

// Drive slot empty, so one tile has no LED.
const blocks: DeskBlock[] = buildDeskBlocks(
  {
    name: "Test",
    fx: [
      fx("bias.noisegate"),
      fx("Compressor", false),
      { type: "", name: "", enabled: false, params: [] },
      fx("Twin"),
      fx("ChorusAnalog"),
      fx("DelayMono"),
      fx("bias.reverb.0"),
    ],
  } as any,
  catalog
);

const onToggle = vi.fn();
const onOpenBrowser = vi.fn();
const onSelectSpy = vi.fn();

// Keeps the selection in state like the screen does, so focus-follow can be checked.
const Harness = ({ initial = AMP_SLOT_INDEX }: { initial?: number }) => {
  const [selected, setSelected] = React.useState(initial);
  return (
    <ChainStrip
      blocks={blocks}
      selectedIndex={selected}
      onSelect={(i) => {
        onSelectSpy(i);
        setSelected(i);
      }}
      onToggle={onToggle}
      onOpenBrowser={onOpenBrowser}
    />
  );
};

const tablist = () => screen.getByRole("tablist", { name: "Signal chain" });
const tab = (name: RegExp) => screen.getByRole("tab", { name });

describe("ChainStrip", () => {
  beforeEach(() => {
    onToggle.mockReset();
    onOpenBrowser.mockReset();
    onSelectSpy.mockReset();
  });

  describe("tab structure", () => {
    it("lets the tablist own only tabs", () => {
      render(<Harness />);
      const list = tablist();
      expect(within(list).getAllByRole("tab")).toHaveLength(7);
      expect(within(list).queryAllByRole("button")).toEqual([]);
      // Wrappers between the tablist and its tabs carry no semantics of their own.
      for (const child of Array.from(list.children)) {
        expect(child).toHaveAttribute("role", "presentation");
        expect(child.querySelectorAll('[role="tab"]')).toHaveLength(1);
      }
    });

    it("keeps one LED per loaded block outside the tablist, still in the chain region", () => {
      render(<Harness />);
      const leds = screen.getAllByRole("button");
      expect(leds.map((b) => b.getAttribute("aria-label"))).toEqual([
        "Gate enabled",
        "Comp disabled",
        "Amp enabled",
        "Mod enabled",
        "Delay enabled",
        "Reverb enabled",
      ]);
      for (const led of leds) {
        expect(tablist().contains(led)).toBe(false);
        // The screen's Space shortcut skips buttons inside the chain region, so the
        // LED's own click is the only toggle.
        expect(led.closest('[data-desk-region="chain"]')).not.toBeNull();
      }
      fireEvent.click(screen.getByRole("button", { name: "Comp disabled" }));
      expect(onToggle).toHaveBeenCalledWith(blocks[1]);
      expect(screen.getByRole("button", { name: "Comp disabled" })).toHaveAttribute("aria-pressed", "false");
    });
  });

  describe("keyboard", () => {
    it("moves to the first and last block with Home and End and keeps focus on the tab", () => {
      render(<Harness />);
      const amp = tab(/^Amp:/);
      amp.focus();

      const parentKeyDown = vi.fn();
      document.addEventListener("keydown", parentKeyDown);
      try {
        const home = fireEvent.keyDown(amp, { key: "Home" });
        expect(home).toBe(false); // default prevented: no page scroll
        expect(onSelectSpy).toHaveBeenLastCalledWith(0);
        expect(document.getElementById(tabIdFor(0))).toHaveFocus();
        expect(document.getElementById(tabIdFor(0))).toHaveAttribute("aria-selected", "true");

        fireEvent.keyDown(document.activeElement!, { key: "End" });
        expect(onSelectSpy).toHaveBeenLastCalledWith(6);
        expect(document.getElementById(tabIdFor(6))).toHaveFocus();
        expect(parentKeyDown).not.toHaveBeenCalled();
      } finally {
        document.removeEventListener("keydown", parentKeyDown);
      }
    });

    it("ignores Home/End with a modifier", () => {
      render(<Harness />);
      fireEvent.keyDown(tab(/^Amp:/), { key: "Home", ctrlKey: true });
      expect(onSelectSpy).not.toHaveBeenCalled();
    });

    it("opens the browser with Enter on a loaded block only", () => {
      render(<Harness />);
      fireEvent.keyDown(tab(/^Amp:/), { key: "Enter" });
      expect(onOpenBrowser).toHaveBeenCalledWith(AMP_SLOT_INDEX);

      onOpenBrowser.mockReset();
      fireEvent.keyDown(tab(/^Drive:/), { key: "Enter" });
      expect(onOpenBrowser).not.toHaveBeenCalled();
    });
  });
});
