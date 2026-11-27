// @vitest-environment jsdom
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import "../../testing/componentTestSetup";
import type { RenameResult } from "../../core/deviceViewModel";
import RenamePresetPopover from "../device/desk/rename-preset-popover";

const renderPopover = (over: Partial<React.ComponentProps<typeof RenamePresetPopover>> = {}) => {
  const props = {
    currentName: "Clean Machine",
    mode: "channel" as const,
    channel: 1,
    hasUnsavedEdits: false,
    onRenameLocal: vi.fn().mockReturnValue(true),
    onRenameChannel: vi.fn().mockResolvedValue({ ok: true, check: "confirmed", reportedName: "New Name" } as RenameResult),
    onClose: vi.fn(),
    ...over,
  };
  render(<RenamePresetPopover {...props} />);
  return props;
};

const input = () => screen.getByRole("textbox", { name: "Name" }) as HTMLInputElement;

const typeName = async (user: ReturnType<typeof userEvent.setup>, value: string) => {
  await user.clear(input());
  if (value) await user.type(input(), value);
};

describe("rename popover", () => {
  it("opens with the current name selected in the input", () => {
    renderPopover();

    expect(screen.getByRole("dialog", { name: "Rename tone" })).toBeInTheDocument();
    expect(input()).toHaveValue("Clean Machine");
    expect(input()).toHaveFocus();
    expect(input().selectionStart).toBe(0);
    expect(input().selectionEnd).toBe("Clean Machine".length);
    expect(input()).toHaveAttribute("maxLength", "40");
    expect(screen.getByText(/Up to 40 characters/)).toHaveTextContent("13/40");
  });

  describe("channel mode", () => {
    it("always says that renaming saves the channel", () => {
      renderPopover();

      expect(screen.getByText("Renaming saves this channel to the amp.")).toBeInTheDocument();
      expect(screen.queryByText(/changes that aren't saved/)).toBeNull();
      expect(screen.queryByRole("button", { name: "Rename here only" })).toBeNull();
      expect(screen.getByRole("button", { name: "Rename channel 2" })).toBeInTheDocument();
    });

    it("warns about unsaved changes and offers a rename here only", async () => {
      const user = userEvent.setup();
      const props = renderPopover({ hasUnsavedEdits: true });

      expect(screen.getByText("Renaming saves this channel to the amp.")).toBeInTheDocument();
      expect(screen.getByText("Channel 2 has changes that aren't saved on the amp. Renaming saves them too.")).toBeInTheDocument();

      await typeName(user, "Local Only");
      await user.click(screen.getByRole("button", { name: "Rename here only" }));

      expect(props.onRenameLocal).toHaveBeenCalledWith("Local Only");
      expect(props.onRenameChannel).not.toHaveBeenCalled();
      expect(props.onClose).toHaveBeenCalled();
    });

    it("renames with Enter and moves focus from the input to the status to Close", async () => {
      const user = userEvent.setup();
      let finish!: (r: RenameResult) => void;
      const props = renderPopover({ onRenameChannel: vi.fn(() => new Promise<RenameResult>((r) => (finish = r))) });

      await typeName(user, "  New Name ");
      fireEvent.keyDown(input(), { key: "Enter" });

      expect(props.onRenameChannel).toHaveBeenCalledWith("New Name");
      const status = screen.getByRole("status");
      expect(status).toHaveTextContent("Saving channel 2…");
      expect(status).toHaveFocus();

      // Esc is ignored while saving
      fireEvent.keyDown(status, { key: "Escape" });
      expect(props.onClose).not.toHaveBeenCalled();

      await act(async () => finish({ ok: true, check: "confirmed", reportedName: "New Name" }));

      expect(screen.getByRole("status")).toHaveTextContent("Renamed channel 2 to “New Name”.");
      expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
    });

    it("does not submit on an Enter that confirms an IME composition", () => {
      const props = renderPopover();
      fireEvent.change(input(), { target: { value: "New Name" } });

      fireEvent.keyDown(input(), { key: "Enter", isComposing: true });
      fireEvent.keyDown(input(), { key: "Enter", keyCode: 229 });

      expect(props.onRenameChannel).not.toHaveBeenCalled();
      expect(input()).toBeInTheDocument();
    });

    it.each<[string, RenameResult, string, "status" | "alert"]>([
      ["unconfirmed", { ok: true, check: "unconfirmed" }, "Saved to channel 2. The amp didn't report the name back.", "status"],
      ["mismatch", { ok: true, check: "mismatch", reportedName: "Old Name" }, "Saved, but the amp reports “Old Name” on channel 2.", "alert"],
      ["store-failed", { ok: false, reason: "store-failed" }, "Couldn't save to channel 2. Check the amp connection and try again.", "alert"],
      ["channel-changed", { ok: false, reason: "channel-changed" }, "The channel changed on the amp. Nothing was saved.", "alert"],
      ["not-loaded", { ok: false, reason: "not-loaded" }, "Channel 2 hasn't loaded from the amp yet. Nothing was saved.", "alert"],
    ])("shows the %s result", async (_label, result, text, role) => {
      const user = userEvent.setup();
      renderPopover({ onRenameChannel: vi.fn().mockResolvedValue(result) });

      await typeName(user, "New Name");
      await user.click(screen.getByRole("button", { name: "Rename channel 2" }));

      expect(await screen.findByRole(role)).toHaveTextContent(text);
      expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
    });

    it("goes back to the name after a failed save", async () => {
      const user = userEvent.setup();
      const props = renderPopover({ onRenameChannel: vi.fn().mockResolvedValue({ ok: false, reason: "store-failed" }) });

      await typeName(user, "New Name");
      await user.click(screen.getByRole("button", { name: "Rename channel 2" }));
      await user.click(await screen.findByRole("button", { name: "Try again" }));

      expect(input()).toHaveValue("New Name");
      expect(input()).toHaveFocus();
      expect(props.onClose).not.toHaveBeenCalled();
    });

    it("offers no Try again when the channel changed", async () => {
      const user = userEvent.setup();
      renderPopover({ onRenameChannel: vi.fn().mockResolvedValue({ ok: false, reason: "channel-changed" }) });

      await typeName(user, "New Name");
      await user.click(screen.getByRole("button", { name: "Rename channel 2" }));

      await screen.findByRole("alert");
      expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    });

    it("treats a rejected rename as a failed save", async () => {
      const user = userEvent.setup();
      renderPopover({ onRenameChannel: vi.fn().mockRejectedValue(new Error("gone")) });

      await typeName(user, "New Name");
      await user.click(screen.getByRole("button", { name: "Rename channel 2" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't save to channel 2");
    });
  });

  describe("validation", () => {
    it("closes without sending anything when the name is unchanged", async () => {
      const user = userEvent.setup();
      const props = renderPopover();

      await typeName(user, " Clean Machine ");
      await user.keyboard("{Enter}");

      expect(props.onClose).toHaveBeenCalled();
      expect(props.onRenameChannel).not.toHaveBeenCalled();
    });

    it("shows the error after a submit attempt and keeps focus in the input", async () => {
      const user = userEvent.setup();
      const props = renderPopover();

      await typeName(user, "クリーン");
      // no error before the first attempt
      expect(input()).toHaveAttribute("aria-invalid", "false");
      expect(screen.queryByRole("alert")).toBeNull();

      await user.click(screen.getByRole("button", { name: "Rename channel 2" }));

      expect(screen.getByRole("alert")).toHaveTextContent(/basic symbols/);
      expect(input()).toHaveAttribute("aria-invalid", "true");
      expect(input()).toHaveAttribute("aria-describedby", screen.getByRole("alert").id);
      expect(input()).toHaveFocus();
      expect(props.onRenameChannel).not.toHaveBeenCalled();

      await typeName(user, "");
      expect(screen.getByRole("alert")).toHaveTextContent("Enter a name.");
    });

    it("shows a too-long name straight away", () => {
      renderPopover({ currentName: "x".repeat(45) });

      expect(screen.getByRole("alert")).toHaveTextContent("Use 40 characters or fewer.");
      expect(input()).toHaveAttribute("aria-invalid", "true");
    });
  });

  describe("local mode", () => {
    it("explains a Live tone and renames without the amp", async () => {
      const user = userEvent.setup();
      const props = renderPopover({ mode: "local", localReason: "live", hasUnsavedEdits: true });

      expect(
        screen.getByText("This tone isn't stored on a channel. The new name is used when you save it to the amp.")
      ).toBeInTheDocument();
      expect(screen.queryByText("Renaming saves this channel to the amp.")).toBeNull();
      expect(screen.queryByRole("button", { name: "Rename here only" })).toBeNull();

      await typeName(user, "Live Name");
      await user.click(screen.getByRole("button", { name: "Rename" }));

      expect(props.onRenameLocal).toHaveBeenCalledWith("Live Name");
      expect(props.onRenameChannel).not.toHaveBeenCalled();
      expect(props.onClose).toHaveBeenCalled();
    });

    it("explains that no amp is connected", () => {
      renderPopover({ mode: "local", localReason: "disconnected" });

      expect(
        screen.getByText("No amp connected. The new name is used when you save it to the amp.")
      ).toBeInTheDocument();
    });
  });

  it("closes on Escape and keeps other keys from reaching the page", () => {
    const props = renderPopover();
    const onWindowKey = vi.fn();
    window.addEventListener("keydown", onWindowKey);
    try {
      fireEvent.keyDown(input(), { key: "2" });
      fireEvent.keyDown(input(), { key: "m" });
      expect(onWindowKey).not.toHaveBeenCalled();

      fireEvent.keyDown(input(), { key: "Escape" });
      expect(props.onClose).toHaveBeenCalled();
      expect(onWindowKey).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener("keydown", onWindowKey);
    }
  });
});
