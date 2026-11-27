// @vitest-environment jsdom
import React from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../testing/componentTestSetup";
import { DeviceStateStore } from "../../stores/devicestate";
import { AppStateStore } from "../../stores/appstate";
import { FxCatalogProvider } from "../../spork/src/devices/spark/sparkFxCatalog";
import { VIRTUAL_CHANNEL } from "../../core/sparkChannels";

// components/app would drag in the whole application on import, so it is mocked
// in case anything under amp-desk.tsx reaches it. The tone chooser and tuner have their own
// tests; here they are stand-ins so only the screen's own behaviour is exercised.
vi.mock("../app", () => ({
  deviceViewModel: {},
  appViewModel: {},
  DeviceViewModelContext: React.createContext(null),
}));
vi.mock("../soundshed/tone-chooser-modal", () => ({
  default: ({ show }: { show: boolean }) => (show ? <div data-testid="tone-chooser" /> : null),
}));
vi.mock("../device/tuner/tuner-panel", () => ({ default: () => <div data-testid="tuner-panel" /> }));

import AmpDesk, { AmpDeskProps } from "../device/desk/amp-desk";
import { isTypingTarget } from "../device/desk/keyboard-targets";

const P = "pg.spark40.";
const catalog = FxCatalogProvider.getFxCatalog();

const fxFromCatalog = (dspId: string, enabled = true) => {
  const item = catalog.catalog.find((c) => c.dspId == P + dspId);
  return {
    type: P + dspId,
    name: item?.name ?? dspId,
    enabled,
    params: (item?.params ?? [{ index: 0, name: "Level", value: 0.5 }]).map((p) => ({
      paramId: String(p.index),
      name: p.name,
      value: p.value ?? 0.5,
      enabled: true,
    })),
  };
};

const makeTone = (overrides: Record<number, any> = {}) => {
  const fx = [
    fxFromCatalog("bias.noisegate"),
    fxFromCatalog("Compressor", false),
    fxFromCatalog("Booster"),
    fxFromCatalog("Twin"),
    fxFromCatalog("ChorusAnalog"),
    fxFromCatalog("DelayMono"),
    fxFromCatalog("bias.reverb.0"),
  ];
  for (const [i, f] of Object.entries(overrides)) fx[Number(i)] = f;
  return { name: "Clean Machine", fx } as any;
};

const setDevice = (patch: Record<string, any>) => act(() => DeviceStateStore.update((s) => Object.assign(s, patch)));

let props: { [K in keyof AmpDeskProps]: ReturnType<typeof vi.fn> };

const renderDesk = () => render(<AmpDesk {...(props as any)} />);

const tab = (name: RegExp) => screen.getByRole("tab", { name });

beforeEach(() => {
  props = {
    onRefresh: vi.fn(),
    onSetChannel: vi.fn(),
    onSaveToAmp: vi.fn().mockResolvedValue(true),
    onStoreFavourite: vi.fn().mockResolvedValue(true),
    onFxParamChange: vi.fn(),
    onFxToggle: vi.fn(),
    onFxChange: vi.fn().mockResolvedValue(true),
  };
  act(() => AppStateStore.update((s) => { s.numPresetSlots = 4; }));
  setDevice({
    isConnected: true,
    connectedDevice: { name: "Spark 40", address: "amp-1" },
    selectedChannel: 1,
    lastHardwareChannel: 1,
    presetTone: makeTone(),
    fxCatalog: catalog,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("chain strip", () => {
  it("shows all seven blocks in chain order with the amp selected", () => {
    renderDesk();

    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual([
      expect.stringContaining("Gate"),
      expect.stringContaining("Comp"),
      expect.stringContaining("Drive"),
      expect.stringContaining("Amp"),
      expect.stringContaining("Mod"),
      expect.stringContaining("Delay"),
      expect.stringContaining("Reverb"),
    ]);
    expect(tab(/^Amp:/)).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(fxFromCatalog("Twin").name);
  });

  it("selects a block on click and shows its controls", async () => {
    const user = userEvent.setup();
    renderDesk();

    await user.click(tab(/^Delay:/));

    expect(tab(/^Delay:/)).toHaveAttribute("aria-selected", "true");
    expect(tab(/^Amp:/)).toHaveAttribute("aria-selected", "false");
    const delayParams = fxFromCatalog("DelayMono").params.map((p) => p.name);
    expect(screen.getByRole("group", { name: /controls/ })).toHaveTextContent(delayParams[0]);
  });

  it("toggles a block with its LED, and dims blocks that are off", async () => {
    const user = userEvent.setup();
    renderDesk();

    const compLed = screen.getByRole("button", { name: "Comp disabled" });
    expect(compLed).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("chain-tile-comp")).toHaveClass("amp-desk-tile--off");

    await user.click(compLed);
    expect(props.onFxToggle).toHaveBeenCalledWith({ dspId: P + "Compressor", value: "1", type: "toggle" });

    await user.click(screen.getByRole("button", { name: "Amp enabled" }));
    expect(props.onFxToggle).toHaveBeenLastCalledWith({ dspId: P + "Twin", value: "0", type: "toggle" });
  });

  it("renders a model the app does not know, using its slot", () => {
    setDevice({ presetTone: makeTone({ 3: { type: P + "JH.SomeFutureAmp", name: "", enabled: true, params: [] } }) });
    renderDesk();

    const tile = screen.getByTestId("chain-tile-amp");
    expect(within(tile).getByRole("tab")).toHaveTextContent("JH.SomeFutureAmp");
    expect(tile.querySelector("img")!.getAttribute("src")).toBe("./images/fx/fallback-amp.webp");
  });

  it("falls back to the generic image and then a placeholder when images are missing", () => {
    renderDesk();
    const img = () => screen.getByTestId("chain-tile-drive").querySelector("img");

    expect(img()!.getAttribute("src")).toMatch(/^\.\/images\/fx\/.+\.webp$/);
    expect(img()!.getAttribute("src")).not.toContain("fallback");

    fireEvent.error(img()!);
    expect(img()!.getAttribute("src")).toBe("./images/fx/fallback-pedal.webp");

    fireEvent.error(img()!);
    expect(img()).toBeNull();
    expect(within(screen.getByTestId("chain-tile-drive")).getByTestId("fx-image-placeholder")).toBeInTheDocument();
  });
});

describe("inspector", () => {
  it("sends knob changes for the selected block", () => {
    renderDesk();
    const gain = screen.getAllByRole("slider")[0];
    const before = Number(gain.getAttribute("aria-valuenow"));

    fireEvent.keyDown(gain, { key: "ArrowUp" });

    expect(props.onFxParamChange).toHaveBeenCalledWith({
      dspId: P + "Twin",
      index: 0,
      value: Math.round((before + 0.01) * 10000) / 10000,
    });
  });

  it("follows external value changes (MIDI, the amp's own knobs)", () => {
    renderDesk();
    const tone = makeTone();
    tone.fx[3].params[0].value = 0.9;

    setDevice({ presetTone: tone });

    expect(screen.getAllByRole("slider")[0]).toHaveAttribute("aria-valuetext", "9.0");
  });

  it("draws switch params as switches", async () => {
    const user = userEvent.setup();
    renderDesk();
    await user.click(tab(/^Delay:/));

    const bpm = screen.getByRole("switch", { name: "BPM" });
    expect(bpm).toHaveAttribute("aria-checked", "false");

    await user.click(bpm);
    expect(props.onFxParamChange).toHaveBeenCalledWith({ dspId: P + "DelayMono", index: 4, value: 1 });
  });

  it("applies a model from the browser and reports a failure inline", async () => {
    const user = userEvent.setup();
    props.onFxChange.mockResolvedValueOnce(false);
    renderDesk();

    await user.click(screen.getByRole("button", { name: "Change model…" }));
    expect(screen.getByTestId("model-browser")).toBeInTheDocument();
    // the chain stays visible while choosing
    expect(screen.getAllByRole("tab")).toHaveLength(7);

    await user.keyboard("{ArrowDown}{Enter}");

    expect(props.onFxChange).toHaveBeenCalledWith({ dspIdOld: P + "Twin", dspIdNew: expect.stringMatching(/^pg\.spark40\./) });
    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't switch/i);
    expect(screen.getByTestId("model-browser")).toBeInTheDocument();
  });
});

describe("keyboard shortcuts", () => {
  it("moves between blocks with the arrow and bracket keys", () => {
    renderDesk();

    fireEvent.keyDown(document.body, { key: "ArrowRight" });
    expect(tab(/^Mod:/)).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(document.body, { key: "[" });
    fireEvent.keyDown(document.body, { key: "[" });
    expect(tab(/^Drive:/)).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(document.body, { key: "]" });
    expect(tab(/^Amp:/)).toHaveAttribute("aria-selected", "true");
  });

  it("does not move between blocks while a knob has focus", () => {
    renderDesk();
    const gain = screen.getAllByRole("slider")[0];
    gain.focus();

    fireEvent.keyDown(gain, { key: "ArrowRight" });

    expect(tab(/^Amp:/)).toHaveAttribute("aria-selected", "true");
  });

  it("toggles the selected block with Space when the chain has focus", () => {
    renderDesk();
    const ampTab = tab(/^Amp:/);
    ampTab.focus();

    fireEvent.keyDown(ampTab, { key: " " });

    expect(props.onFxToggle).toHaveBeenCalledWith({ dspId: P + "Twin", value: "0", type: "toggle" });
  });

  it("ignores Space when focus is elsewhere", () => {
    renderDesk();

    fireEvent.keyDown(document.body, { key: " " });

    expect(props.onFxToggle).not.toHaveBeenCalled();
  });

  it("opens the model browser with M, Enter on a tile and /, and closes it with Esc", () => {
    renderDesk();

    fireEvent.keyDown(document.body, { key: "m" });
    expect(screen.getByTestId("model-browser")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Search models" })).toHaveFocus();

    fireEvent.keyDown(screen.getByRole("combobox", { name: "Search models" }), { key: "Escape" });
    expect(screen.queryByTestId("model-browser")).toBeNull();

    fireEvent.keyDown(tab(/^Amp:/), { key: "Enter" });
    expect(screen.getByTestId("model-browser")).toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.queryByTestId("model-browser")).toBeNull();

    fireEvent.keyDown(document.body, { key: "/" });
    expect(screen.getByTestId("model-browser")).toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: "f", ctrlKey: true });
    expect(screen.getByTestId("model-browser")).toBeInTheDocument();
  });

  it("keeps arrow navigation on the chain while the model browser is open", async () => {
    const user = userEvent.setup();
    renderDesk();
    const search = () => screen.getByRole("combobox", { name: "Search models" });

    fireEvent.keyDown(tab(/^Amp:/), { key: "Enter" });
    expect(search()).toHaveFocus();

    await user.click(tab(/^Amp:/));
    await user.keyboard("{ArrowRight}");
    expect(tab(/^Mod:/)).toHaveAttribute("aria-selected", "true");
    expect(tab(/^Mod:/)).toHaveFocus();
    expect(search()).not.toHaveFocus();

    await user.keyboard("{ArrowRight}");
    expect(tab(/^Delay:/)).toHaveAttribute("aria-selected", "true");
    expect(tab(/^Delay:/)).toHaveFocus();
    // the browser follows the selection
    expect(screen.getByTestId("model-browser")).toBeInTheDocument();
  });

  it("focuses the search when the browser is opened by double-clicking a block", async () => {
    const user = userEvent.setup();
    renderDesk();

    // the first click selects (no browser yet), the double-click then opens it
    await user.dblClick(tab(/^Delay:/));

    expect(tab(/^Delay:/)).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("combobox", { name: "Search models" })).toHaveFocus();
  });

  it("does not treat typing in the model search as shortcuts", async () => {
    const user = userEvent.setup();
    renderDesk();
    fireEvent.keyDown(document.body, { key: "m" });

    await user.type(screen.getByRole("combobox", { name: "Search models" }), "m[[]? ");

    expect(screen.getByRole("combobox", { name: "Search models" })).toHaveValue("m[]? ");
    expect(tab(/^Amp:/)).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("dialog", { name: "Keyboard shortcuts" })).toBeNull();
    expect(props.onFxToggle).not.toHaveBeenCalled();
  });

  it("opens Save to Amp with Ctrl/Cmd+S and the help with ?", () => {
    renderDesk();

    fireEvent.keyDown(document.body, { key: "s", metaKey: true });
    expect(screen.getByRole("dialog", { name: "Save to amp" })).toBeInTheDocument();

    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Save to amp" })).toBeNull();

    fireEvent.keyDown(document.body, { key: "?" });
    expect(screen.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeInTheDocument();
  });

  it("leaves digit keys alone (they select channels through the input mappings)", () => {
    renderDesk();

    fireEvent.keyDown(document.body, { key: "2" });

    expect(props.onSetChannel).not.toHaveBeenCalled();
    expect(tab(/^Amp:/)).toHaveAttribute("aria-selected", "true");
  });
});

describe("top bar", () => {
  it("selects channels with the Channel N buttons", async () => {
    const user = userEvent.setup();
    renderDesk();

    expect(screen.getByRole("button", { name: "Channel 2" })).toHaveAttribute("aria-pressed", "true");
    expect(document.getElementById("ch4")).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "Channel 3" }));
    expect(props.onSetChannel).toHaveBeenCalledWith(2);
  });

  it("marks an applied, unsaved tone as Live", () => {
    setDevice({ selectedChannel: VIRTUAL_CHANNEL });
    renderDesk();

    expect(screen.getByText("Live")).toBeInTheDocument();
    for (const b of screen.getAllByRole("button", { name: /^Channel \d$/ })) {
      expect(b).toHaveAttribute("aria-pressed", "false");
    }
  });

  it("saves a Live tone to the last hardware channel, never the virtual one", async () => {
    const user = userEvent.setup();
    renderDesk(); // channel 2 (index 1) is in use
    setDevice({ selectedChannel: VIRTUAL_CHANNEL, lastHardwareChannel: 1 });

    await user.click(screen.getByRole("button", { name: /save to amp/i }));
    const picker = screen.getByRole("dialog", { name: "Save to amp" });
    const slots = within(picker).getAllByRole("radio");
    expect(slots.map((s) => s.textContent)).toEqual(["1", "2", "3", "4"]);
    expect(within(picker).getByRole("radio", { name: "Slot 2" })).toHaveAttribute("aria-checked", "true");

    await user.click(within(picker).getByRole("button", { name: /save to channel 2/i }));
    await user.click(within(picker).getByRole("button", { name: /overwrite channel 2/i }));

    expect(props.onSaveToAmp).toHaveBeenCalledWith(1);
    expect(props.onSaveToAmp).not.toHaveBeenCalledWith(VIRTUAL_CHANNEL);
    expect(await within(picker).findByRole("status")).toHaveTextContent("Saved to channel 2");
  });

  it("defaults Save to the stored last hardware channel when the screen opens on a Live tone", async () => {
    const user = userEvent.setup();
    // e.g. a tone applied on channel 3, then back to the amp screen after another page
    setDevice({ selectedChannel: VIRTUAL_CHANNEL, lastHardwareChannel: 2 });
    renderDesk();

    await user.click(screen.getByRole("button", { name: /save to amp/i }));
    expect(screen.getByRole("radio", { name: "Slot 3" })).toHaveAttribute("aria-checked", "true");
  });

  it("falls back to slot 1 when the last hardware channel is unknown or out of range", async () => {
    const user = userEvent.setup();
    setDevice({ selectedChannel: VIRTUAL_CHANNEL, lastHardwareChannel: 6 });
    renderDesk();

    await user.click(screen.getByRole("button", { name: /save to amp/i }));
    expect(screen.getByRole("radio", { name: "Slot 1" })).toHaveAttribute("aria-checked", "true");
  });

  it("cannot save with no amp connected", async () => {
    setDevice({ isConnected: false });
    renderDesk();

    const save = screen.getByRole("button", { name: /save to amp/i });
    expect(save).toBeDisabled();

    fireEvent.keyDown(document.body, { key: "s", ctrlKey: true });
    expect(screen.queryByRole("dialog", { name: "Save to amp" })).toBeNull();
    expect(screen.getByRole("alert")).toHaveTextContent(/connect an amp/i);
    expect(props.onSaveToAmp).not.toHaveBeenCalled();
  });

  it("shows a refused save as a failure in the picker", async () => {
    const user = userEvent.setup();
    props.onSaveToAmp.mockResolvedValueOnce(false);
    renderDesk();

    await user.click(screen.getByRole("button", { name: /save to amp/i }));
    await user.click(screen.getByRole("button", { name: /save to channel 2/i }));
    await user.click(screen.getByRole("button", { name: /overwrite channel 2/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't save to channel 2");
  });

  it("keeps the picker open while saving, so the result is always shown, and allows one save at a time", async () => {
    const user = userEvent.setup();
    let finish!: (ok: boolean) => void;
    props.onSaveToAmp.mockImplementation(() => new Promise<boolean>((r) => (finish = r)));
    renderDesk();

    const saveButton = screen.getByRole("button", { name: /save to amp/i });
    await user.click(saveButton);
    await user.click(screen.getByRole("button", { name: /save to channel 2/i }));
    await user.click(screen.getByRole("button", { name: /overwrite channel 2/i }));
    const picker = screen.getByRole("dialog", { name: "Save to amp" });
    expect(within(picker).getByRole("status")).toHaveTextContent("Saving to channel 2");

    // every way of dismissing it is refused while the upload runs
    fireEvent.keyDown(document.body, { key: "Escape" });
    fireEvent.keyDown(within(picker).getByRole("status"), { key: "Escape" });
    await user.click(tab(/^Delay:/));
    fireEvent.keyDown(document.body, { key: "?" });
    fireEvent.keyDown(document.body, { key: "s", metaKey: true });
    fireEvent.keyDown(document.body, { key: "m" });
    expect(screen.getByRole("dialog", { name: "Save to amp" })).toBe(picker);
    expect(screen.queryByRole("dialog", { name: "Keyboard shortcuts" })).toBeNull();
    expect(saveButton).toBeDisabled();

    await act(async () => finish(false));

    expect(within(picker).getByRole("alert")).toHaveTextContent("Couldn't save to channel 2");
    expect(props.onSaveToAmp).toHaveBeenCalledTimes(1);
    expect(saveButton).toBeEnabled();
  });

  it("returns focus to Save to Amp when the picker closes", async () => {
    const user = userEvent.setup();
    renderDesk();
    const saveButton = screen.getByRole("button", { name: /save to amp/i });

    await user.click(saveButton);
    expect(screen.getByRole("radio", { name: "Slot 2" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Save to amp" })).toBeNull();
    expect(saveButton).toHaveFocus();

    await user.click(saveButton);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(saveButton).toHaveFocus();

    // after a save, Close (focused by the picker) hands focus back too
    await user.click(saveButton);
    await user.click(screen.getByRole("button", { name: /save to channel 2/i }));
    await user.click(screen.getByRole("button", { name: /overwrite channel 2/i }));
    expect(await screen.findByRole("button", { name: "Close" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(saveButton).toHaveFocus();

    // Esc reaching the window with focus already on <body>
    await user.click(saveButton);
    act(() => (document.activeElement as HTMLElement).blur());
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(saveButton).toHaveFocus();
  });

  it("returns focus to the help button when the shortcut help closes, but not after an outside click", async () => {
    const user = userEvent.setup();
    renderDesk();
    const helpButton = screen.getByRole("button", { name: "Keyboard shortcuts" });

    await user.click(helpButton);
    expect(screen.getByRole("button", { name: "Close shortcuts" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(helpButton).toHaveFocus();

    await user.click(helpButton);
    await user.click(screen.getByRole("button", { name: "Close shortcuts" }));
    expect(helpButton).toHaveFocus();

    fireEvent.keyDown(document.body, { key: "?" });
    expect(screen.getByRole("button", { name: "Close shortcuts" })).toHaveFocus();
    await user.keyboard("?");
    expect(screen.queryByRole("dialog", { name: "Keyboard shortcuts" })).toBeNull();
    expect(helpButton).toHaveFocus();

    await user.click(helpButton);
    await user.click(tab(/^Delay:/));
    expect(screen.queryByRole("dialog", { name: "Keyboard shortcuts" })).toBeNull();
    expect(tab(/^Delay:/)).toHaveFocus();
  });

  it("stores a favourite and confirms inline", async () => {
    const user = userEvent.setup();
    renderDesk();

    await user.click(screen.getByRole("button", { name: /favourite/i }));

    expect(props.onStoreFavourite).toHaveBeenCalled();
    expect(await screen.findByText("Saved to favourites.")).toBeInTheDocument();
  });

  it("opens the tone browser and the tuner drawer", async () => {
    const user = userEvent.setup();
    renderDesk();

    await user.click(screen.getByRole("button", { name: "Browse Tones" }));
    expect(screen.getByTestId("tone-chooser")).toBeInTheDocument();

    expect(screen.queryByTestId("tuner-panel")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Tuner" }));
    expect(screen.getByTestId("tuner-panel")).toBeInTheDocument();
  });
});

describe("typing targets", () => {
  it.each([
    ["<input type='text'>", "input"],
    ["<textarea></textarea>", "textarea"],
    ["<select><option>a</option></select>", "select"],
    ["<div role='combobox' tabindex='0'></div>", "[role=combobox]"],
    ["<div role='searchbox' tabindex='0'></div>", "[role=searchbox]"],
    ["<div contenteditable='true'><span id='inner'>x</span></div>", "#inner"],
  ])("treats %s as typing", (html, selector) => {
    document.body.innerHTML = html;
    expect(isTypingTarget(document.querySelector(selector))).toBe(true);
    document.body.innerHTML = "";
  });

  it("does not treat buttons or sliders as typing", () => {
    document.body.innerHTML = "<button>b</button><div role='slider' tabindex='0'></div>";
    expect(isTypingTarget(document.querySelector("button"))).toBe(false);
    expect(isTypingTarget(document.querySelector("[role=slider]"))).toBe(false);
    document.body.innerHTML = "";
  });
});
