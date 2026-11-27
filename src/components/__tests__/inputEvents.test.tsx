// @vitest-environment jsdom
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../testing/componentTestSetup";
import { AppStateStore } from "../../stores/appstate";

// input-events.tsx takes the view models from components/app, which would pull in the
// whole application on import.
const { setChannel } = vi.hoisted(() => ({ setChannel: vi.fn() }));
vi.mock("../app", () => ({
  deviceViewModel: { setChannel },
  appViewModel: {},
}));

import { keyboardChannelListener } from "../device/input-events";
import SaveSlotPicker from "../device/desk/save-slot-picker";

const keyMapping = (key: string, channel: number) => ({
  id: "k" + key,
  name: `Key ${key} to CH${channel + 1}`,
  source: { type: "keyboard", code: key },
  target: { type: "amp-channel", value: String(channel) },
});

beforeEach(() => {
  setChannel.mockReset().mockResolvedValue(true);
  act(() =>
    AppStateStore.update((s) => {
      s.numPresetSlots = 4;
      s.inputEventMappings = ["1", "2", "3", "4", "5", "6", "7", "8"].map((k, i) => keyMapping(k, i)) as any;
    })
  );
  // capture phase on window, as the app registers it
  window.addEventListener("keydown", keyboardChannelListener, true);
});

afterEach(() => {
  window.removeEventListener("keydown", keyboardChannelListener, true);
  document.body.innerHTML = "";
});

describe("keyboard channel mappings", () => {
  it("selects the mapped channel for a key pressed outside any popover", () => {
    fireEvent.keyDown(document.body, { key: "3" });

    expect(setChannel).toHaveBeenCalledTimes(1);
    expect(setChannel).toHaveBeenCalledWith(2);
  });

  it("ignores mappings to channels the amp does not have", () => {
    fireEvent.keyDown(document.body, { key: "5" });
    fireEvent.keyDown(document.body, { key: "8" });

    expect(setChannel).not.toHaveBeenCalled();

    act(() => AppStateStore.update((s) => { s.numPresetSlots = 8; }));
    fireEvent.keyDown(document.body, { key: "8" });
    expect(setChannel).toHaveBeenCalledWith(7);
  });

  it("ignores repeats and keys typed into a field", () => {
    document.body.innerHTML = "<input aria-label='field'>";
    const input = screen.getByRole("textbox", { name: "field" });
    input.focus();

    fireEvent.keyDown(input, { key: "2" });
    fireEvent.keyDown(document.body, { key: "2", repeat: true });

    expect(setChannel).not.toHaveBeenCalled();
  });

  it.each([
    ["a dialog", "<div role='dialog'><button>x</button></div>"],
    ["the model browser", "<div class='amp-desk-browser'><button>x</button></div>"],
  ])("leaves keys pressed inside %s alone", (_name, html) => {
    document.body.innerHTML = html;
    const button = document.querySelector("button")!;
    button.focus();

    fireEvent.keyDown(button, { key: "2" });
    // focus inside, event dispatched at the window (as when the target is retargeted)
    fireEvent.keyDown(window, { key: "2" });

    expect(setChannel).not.toHaveBeenCalled();
  });

  it("lets a digit in the Save to Amp picker choose a slot instead of switching the amp", () => {
    const onSave = vi.fn().mockResolvedValue(true);
    render(<SaveSlotPicker numSlots={4} defaultSlot={0} toneName="Live tone" onSave={onSave} onClose={vi.fn()} />);
    const slot1 = screen.getByRole("radio", { name: "Slot 1" });
    expect(slot1).toHaveFocus();

    fireEvent.keyDown(slot1, { key: "3" });

    expect(setChannel).not.toHaveBeenCalled();
    expect(screen.getByRole("radio", { name: "Slot 3" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Slot 3" })).toHaveFocus();
  });
});
