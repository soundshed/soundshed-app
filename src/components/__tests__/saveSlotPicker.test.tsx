// @vitest-environment jsdom
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import "../../testing/componentTestSetup";
import { VIRTUAL_CHANNEL } from "../../core/sparkChannels";
import SaveSlotPicker from "../device/desk/save-slot-picker";

const renderPicker = (over: Partial<React.ComponentProps<typeof SaveSlotPicker>> = {}) => {
  const props = {
    numSlots: 4,
    defaultSlot: 0,
    toneName: "Crunchy",
    onSave: vi.fn().mockResolvedValue(true),
    onClose: vi.fn(),
    ...over,
  };
  render(<SaveSlotPicker {...props} />);
  return props;
};

const slots = () => screen.getAllByRole("radio");

describe("save slot picker", () => {
  it("offers only the hardware slots, never the virtual channel", () => {
    renderPicker({ numSlots: 8, defaultSlot: VIRTUAL_CHANNEL });

    expect(slots().map((s) => s.textContent)).toEqual(["1", "2", "3", "4", "5", "6", "7", "8"]);
    // an out-of-range default falls back to the first slot
    expect(screen.getByRole("radio", { name: "Slot 1" })).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByText(String(VIRTUAL_CHANNEL + 1))).toBeNull();
  });

  it("preselects the given channel and focuses it", () => {
    renderPicker({ defaultSlot: 2 });

    expect(screen.getByRole("radio", { name: "Slot 3" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Slot 3" })).toHaveFocus();
  });

  it("asks before overwriting and saves to the chosen slot", async () => {
    const user = userEvent.setup();
    const props = renderPicker();

    await user.click(screen.getByRole("radio", { name: "Slot 4" }));
    await user.click(screen.getByRole("button", { name: /save to channel 4/i }));

    expect(props.onSave).not.toHaveBeenCalled();
    expect(screen.getByText(/overwrite channel 4 on the amp with “Crunchy”/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Overwrite channel 4" }));

    expect(props.onSave).toHaveBeenCalledTimes(1);
    expect(props.onSave).toHaveBeenCalledWith(3, "Crunchy");
    expect(await screen.findByRole("status")).toHaveTextContent("Saved to channel 4 as “Crunchy”.");
  });

  it("goes back from the confirmation without saving", async () => {
    const user = userEvent.setup();
    const props = renderPicker();

    await user.click(screen.getByRole("button", { name: /save to channel 1/i }));
    await user.click(screen.getByRole("button", { name: "Back" }));

    expect(slots()).toHaveLength(4);
    expect(props.onSave).not.toHaveBeenCalled();
  });

  it("shows a failure inline and lets the user try again", async () => {
    const user = userEvent.setup();
    const props = renderPicker({ onSave: vi.fn().mockResolvedValue(false) });

    await user.click(screen.getByRole("button", { name: /save to channel 1/i }));
    await user.click(screen.getByRole("button", { name: "Overwrite channel 1" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't save to channel 1");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(slots()).toHaveLength(4);
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it("treats a rejected save as a failure", async () => {
    const user = userEvent.setup();
    renderPicker({ onSave: vi.fn().mockRejectedValue(new Error("gone")) });

    await user.click(screen.getByRole("button", { name: /save to channel 1/i }));
    await user.click(screen.getByRole("button", { name: "Overwrite channel 1" }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("moves between slots with Left/Right without leaving the range", () => {
    renderPicker({ defaultSlot: 3 });

    fireEvent.keyDown(screen.getByRole("radio", { name: "Slot 4" }), { key: "ArrowRight" });
    expect(screen.getByRole("radio", { name: "Slot 4" })).toHaveAttribute("aria-checked", "true");

    fireEvent.keyDown(screen.getByRole("radio", { name: "Slot 4" }), { key: "ArrowLeft" });
    expect(screen.getByRole("radio", { name: "Slot 3" })).toHaveAttribute("aria-checked", "true");
  });

  it("picks a slot with its digit key and ignores digits past the last slot", () => {
    renderPicker();

    fireEvent.keyDown(screen.getByRole("radio", { name: "Slot 1" }), { key: "4" });
    expect(screen.getByRole("radio", { name: "Slot 4" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Slot 4" })).toHaveFocus();

    fireEvent.keyDown(screen.getByRole("radio", { name: "Slot 4" }), { key: "6" });
    expect(screen.getByRole("radio", { name: "Slot 4" })).toHaveAttribute("aria-checked", "true");
  });

  it("keeps focus inside while saving and moves it to Close when done", async () => {
    const user = userEvent.setup();
    let finish!: (ok: boolean) => void;
    const props = renderPicker({ onSave: vi.fn(() => new Promise<boolean>((r) => (finish = r))) });

    await user.click(screen.getByRole("button", { name: /save to channel 1/i }));
    await user.click(screen.getByRole("button", { name: "Overwrite channel 1" }));

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Saving to channel 1");
    expect(status).toHaveFocus();

    // a running save cannot be dismissed, so its result is never lost
    fireEvent.keyDown(status, { key: "Escape" });
    expect(props.onClose).not.toHaveBeenCalled();

    await act(async () => finish(false));

    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't save to channel 1");
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
    expect(props.onSave).toHaveBeenCalledTimes(1);
  });

  describe("name field", () => {
    const nameInput = () => screen.getByRole("textbox", { name: "Name" }) as HTMLInputElement;

    it("starts with the tone's name, above the slots, while focus stays on the checked slot", () => {
      renderPicker({ defaultSlot: 1 });

      expect(nameInput()).toHaveValue("Crunchy");
      expect(screen.getByRole("radio", { name: "Slot 2" })).toHaveFocus();
      // first in Tab order
      expect(nameInput().compareDocumentPosition(slots()[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it("types digits and moves the caret with arrows instead of picking a slot", async () => {
      const user = userEvent.setup();
      renderPicker({ defaultSlot: 0 });

      await user.click(nameInput());
      await user.keyboard("{End} 2{ArrowLeft}{ArrowLeft}{ArrowRight}3");

      expect(nameInput()).toHaveValue("Crunchy 32");
      expect(screen.getByRole("radio", { name: "Slot 1" })).toHaveAttribute("aria-checked", "true");
      expect(nameInput()).toHaveFocus();
    });

    it("goes to the confirmation with Enter in the field", async () => {
      const user = userEvent.setup();
      renderPicker();

      await user.click(nameInput());
      await user.keyboard("{Enter}");

      expect(screen.getByRole("button", { name: "Overwrite channel 1" })).toHaveFocus();
    });

    it("does not go on with an Enter that confirms an IME composition", () => {
      renderPicker();

      fireEvent.keyDown(nameInput(), { key: "Enter", isComposing: true });

      expect(screen.queryByRole("button", { name: "Overwrite channel 1" })).toBeNull();
    });

    it("blocks the confirmation while the name is invalid and says why", async () => {
      const user = userEvent.setup();
      const props = renderPicker();

      await user.clear(nameInput());
      expect(nameInput()).toHaveAttribute("aria-invalid", "true");
      expect(screen.getByRole("alert")).toHaveTextContent("Enter a name.");
      expect(screen.getByRole("button", { name: /save to channel 1/i })).toHaveAttribute("aria-disabled", "true");

      await user.click(screen.getByRole("button", { name: /save to channel 1/i }));
      expect(screen.queryByRole("button", { name: "Overwrite channel 1" })).toBeNull();
      expect(nameInput()).toHaveFocus();

      await user.type(nameInput(), "Café");
      expect(screen.getByRole("alert")).toHaveTextContent(/basic symbols/);
      expect(props.onSave).not.toHaveBeenCalled();
    });

    it("saves under the edited, trimmed name and shows it in the confirmation", async () => {
      const user = userEvent.setup();
      const props = renderPicker();

      await user.clear(nameInput());
      await user.type(nameInput(), "  Crunchy Lead ");
      await user.click(screen.getByRole("button", { name: /save to channel 1/i }));

      expect(screen.getByText("Overwrite channel 1 on the amp with “Crunchy Lead”?")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Overwrite channel 1" }));

      expect(props.onSave).toHaveBeenCalledWith(0, "Crunchy Lead");
      expect(await screen.findByRole("status")).toHaveTextContent("Saved to channel 1 as “Crunchy Lead”.");
    });

    it("closes on Escape from the field", () => {
      const props = renderPicker();

      fireEvent.keyDown(nameInput(), { key: "Escape" });

      expect(props.onClose).toHaveBeenCalled();
    });
  });

  it("closes on Escape", () => {
    const props = renderPicker();

    fireEvent.keyDown(screen.getByRole("radio", { name: "Slot 1" }), { key: "Escape" });

    expect(props.onClose).toHaveBeenCalled();
    expect(props.onSave).not.toHaveBeenCalled();
  });
});
