// @vitest-environment jsdom
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import "../../testing/componentTestSetup";
import { FxCatalogProvider } from "../../spork/src/devices/spark/sparkFxCatalog";
import ModelBrowser from "../device/desk/model-browser";
import { AMP_SLOT_INDEX, buildDeskBlocks } from "../device/desk/desk-model";

const P = "pg.spark40.";
const catalog = FxCatalogProvider.getFxCatalog();

const fx = (dspId: string) => ({ type: P + dspId, name: dspId, enabled: true, params: [] });
const blocks = buildDeskBlocks(
  {
    name: "Test",
    fx: ["bias.noisegate", "Compressor", "Booster", "Twin", "ChorusAnalog", "DelayMono", "bias.reverb.0"].map(fx),
  } as any,
  catalog
);
const ampBlock = blocks[AMP_SLOT_INDEX];

const renderBrowser = (props: Partial<React.ComponentProps<typeof ModelBrowser>> = {}) =>
  render(
    <ModelBrowser
      block={ampBlock}
      catalog={catalog}
      onApply={vi.fn(async () => true)}
      onClose={vi.fn()}
      {...props}
    />
  );

const search = () => screen.getByRole("combobox", { name: "Search models" });
const selectedOption = () => screen.getAllByRole("option").find((o) => o.getAttribute("aria-selected") == "true")!;

describe("ModelBrowser", () => {
  describe("search focus", () => {
    it("focuses the search box when opened", () => {
      renderBrowser();
      expect(search()).toHaveFocus();
    });

    // When the screen remounts the browser for a newly selected block, focus must stay
    // on the chain tab so ←/→ keep walking the chain.
    it("leaves focus alone with autoFocusSearch={false}", () => {
      const outside = document.createElement("button");
      document.body.appendChild(outside);
      try {
        outside.focus();
        renderBrowser({ autoFocusSearch: false });
        expect(outside).toHaveFocus();
        expect(search()).not.toHaveFocus();
      } finally {
        outside.remove();
      }
    });
  });

  describe("combobox semantics", () => {
    it("marks the search box as a list combobox that controls the model list", () => {
      renderBrowser();
      const input = search();
      const list = screen.getByRole("listbox");
      expect(input).toHaveAttribute("aria-expanded", "true");
      expect(input).toHaveAttribute("aria-autocomplete", "list");
      expect(input).toHaveAttribute("aria-controls", list.id);
    });

    it("points aria-activedescendant on the focused input at the active option", () => {
      renderBrowser();
      const input = search();
      const first = selectedOption();
      expect(input).toHaveAttribute("aria-activedescendant", first.id);
      // It starts on the current model.
      expect(first).toHaveAttribute("aria-current", "true");

      fireEvent.keyDown(input, { key: "ArrowDown" });
      const next = selectedOption();
      expect(next).not.toBe(first);
      expect(input).toHaveAttribute("aria-activedescendant", next.id);
      expect(screen.getByRole("listbox")).toHaveAttribute("aria-activedescendant", next.id);
    });

    it("drops aria-activedescendant when nothing matches", () => {
      renderBrowser();
      fireEvent.change(search(), { target: { value: "zzzz-no-such-model" } });
      expect(screen.queryAllByRole("option")).toEqual([]);
      expect(search()).not.toHaveAttribute("aria-activedescendant");
    });
  });
});
