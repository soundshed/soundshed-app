// @vitest-environment jsdom
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import "../../testing/componentTestSetup";
import AmpKnob, { LIVE_THROTTLE_MS, WHEEL_COMMIT_MS } from "../device/desk/amp-knob";

const onChange = vi.fn();

const renderKnob = (props: Partial<React.ComponentProps<typeof AmpKnob>> = {}) =>
  render(<AmpKnob label="Gain" value={0.5} defaultValue={0.3} onChange={onChange} {...props} />);

const knob = () => screen.getByRole("slider", { name: "Gain" });
const readout = () => screen.getByTestId("amp-knob-value");
const calls = () => onChange.mock.calls.map(([v, phase]) => [Number(v.toFixed(4)), phase]);

describe("AmpKnob", () => {
  beforeEach(() => {
    onChange.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("accessibility", () => {
    it("exposes slider semantics and the 0-10 readout as the value text", () => {
      renderKnob({ value: 0.64 });
      const k = knob();
      expect(k).toHaveAttribute("tabindex", "0");
      expect(k).toHaveAttribute("aria-valuemin", "0");
      expect(k).toHaveAttribute("aria-valuemax", "1");
      expect(k).toHaveAttribute("aria-valuenow", "0.64");
      expect(k).toHaveAttribute("aria-valuetext", "6.4");
      expect(readout()).toHaveTextContent("6.4");
      expect(screen.getByText("Gain")).toBeInTheDocument();
    });

    it("uses a custom formatter for readout and aria-valuetext", () => {
      renderKnob({ value: 0.25, formatValue: (v) => `${Math.round(v * 100)}%` });
      expect(knob()).toHaveAttribute("aria-valuetext", "25%");
      expect(readout()).toHaveTextContent("25%");
    });

    it("is removed from the tab order and ignores input when disabled", () => {
      renderKnob({ disabled: true });
      const k = knob();
      expect(k).toHaveAttribute("tabindex", "-1");
      expect(k).toHaveAttribute("aria-disabled", "true");
      fireEvent.keyDown(k, { key: "ArrowUp" });
      fireEvent.wheel(k, { deltaY: -100 });
      fireEvent.doubleClick(k);
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe("keyboard", () => {
    it.each([
      ["ArrowUp", false, 0.51],
      ["ArrowRight", false, 0.51],
      ["ArrowDown", false, 0.49],
      ["ArrowLeft", false, 0.49],
      ["ArrowUp", true, 0.6],
      ["ArrowDown", true, 0.4],
      ["PageUp", false, 0.6],
      ["PageDown", false, 0.4],
      ["Home", false, 0],
      ["End", false, 1],
    ])("%s (shift=%s) commits %s", (key, shiftKey, expected) => {
      renderKnob();
      fireEvent.keyDown(knob(), { key, shiftKey });
      expect(calls()).toEqual([[expected, "commit"]]);
      expect(knob()).toHaveAttribute("aria-valuenow", String(expected));
    });

    it("accumulates steps without float drift and clamps at the ends", () => {
      renderKnob({ value: 0.97 });
      const k = knob();
      for (let i = 0; i < 5; i++) fireEvent.keyDown(k, { key: "ArrowUp" });
      // 0.98, 0.99, 1 then nothing more to send.
      expect(calls()).toEqual([
        [0.98, "commit"],
        [0.99, "commit"],
        [1, "commit"],
      ]);
      expect(k).toHaveAttribute("aria-valuetext", "10.0");
    });

    it("does not let handled keys reach the screen's shortcuts", () => {
      const parentKeyDown = vi.fn();
      render(
        <div onKeyDown={parentKeyDown}>
          <AmpKnob label="Gain" value={0.5} onChange={onChange} />
        </div>
      );
      fireEvent.keyDown(knob(), { key: "ArrowLeft" });
      expect(parentKeyDown).not.toHaveBeenCalled();
      // Unhandled keys (e.g. Space for block on/off) still bubble.
      fireEvent.keyDown(knob(), { key: " " });
      expect(parentKeyDown).toHaveBeenCalledTimes(1);
    });

    it("streams a held key as live changes and commits on key up", () => {
      vi.useFakeTimers();
      renderKnob();
      const k = knob();
      fireEvent.keyDown(k, { key: "ArrowUp", repeat: true });
      fireEvent.keyDown(k, { key: "ArrowUp", repeat: true });
      fireEvent.keyUp(k, { key: "ArrowUp" });
      expect(calls()).toEqual([
        [0.51, "live"],
        [0.52, "commit"],
      ]);
    });

    // The key can be released after focus has left the dial, so its keyup never
    // reaches it; the gesture must still end or the knob stops following the amp.
    it.each([
      ["focus moves off the dial", (k: HTMLElement) => fireEvent.blur(k)],
      ["the window loses focus", () => fireEvent.blur(window)],
      ["the key is released elsewhere", () => fireEvent.keyUp(document.body, { key: "ArrowUp" })],
    ])("ends a held key gesture when %s and follows external values again", (_name, release) => {
      const { rerender } = renderKnob({ value: 0.7 });
      const k = knob();
      fireEvent.keyDown(k, { key: "ArrowUp" });
      fireEvent.keyDown(k, { key: "ArrowUp", repeat: true });
      release(k);
      expect(calls().slice(-1)[0]).toEqual([0.72, "commit"]);

      rerender(<AmpKnob label="Gain" value={0.9} onChange={onChange} />);
      expect(readout()).toHaveTextContent("9.0");
      rerender(<AmpKnob label="Gain" value={0.2} onChange={onChange} />);
      expect(readout()).toHaveTextContent("2.0");

      // The next press starts from the amp's value, not the stale one.
      fireEvent.keyDown(k, { key: "ArrowUp" });
      expect(calls().slice(-1)[0]).toEqual([0.21, "commit"]);
    });

    it("ends a held key gesture when Enter opens the value field", () => {
      const { rerender } = renderKnob({ value: 0.7 });
      const k = knob();
      k.focus();
      fireEvent.keyDown(k, { key: "ArrowUp", repeat: true });
      fireEvent.keyDown(k, { key: "Enter" });
      const input = screen.getByRole("textbox", { name: "Gain value (0 to 10)" });
      expect(input).toHaveFocus(); // the dial lost focus before the key came up
      fireEvent.keyDown(input, { key: "Escape" });

      rerender(<AmpKnob label="Gain" value={0.4} onChange={onChange} />);
      expect(readout()).toHaveTextContent("4.0");
    });
  });

  describe("wheel", () => {
    it("steps 0.01 per notch, prevents page scroll and commits once idle", () => {
      vi.useFakeTimers();
      renderKnob();
      const notCancelled = fireEvent.wheel(knob(), { deltaY: -100 });
      expect(notCancelled).toBe(false);
      expect(calls()).toEqual([[0.51, "live"]]);

      act(() => {
        vi.advanceTimersByTime(WHEEL_COMMIT_MS);
      });
      expect(calls()).toEqual([
        [0.51, "live"],
        [0.51, "commit"],
      ]);
    });

    it("uses 0.001 steps with Shift (also when the platform reports deltaX)", () => {
      vi.useFakeTimers();
      renderKnob();
      fireEvent.wheel(knob(), { deltaY: 100, shiftKey: true });
      act(() => {
        vi.advanceTimersByTime(LIVE_THROTTLE_MS);
      });
      fireEvent.wheel(knob(), { deltaY: 0, deltaX: 100, shiftKey: true });
      act(() => {
        vi.advanceTimersByTime(WHEEL_COMMIT_MS);
      });
      expect(calls()).toEqual([
        [0.499, "live"],
        [0.498, "live"],
        [0.498, "commit"],
      ]);
    });
  });

  describe("double-click reset", () => {
    it("restores the model default", () => {
      renderKnob({ value: 0.9, defaultValue: 0.3 });
      fireEvent.doubleClick(knob());
      expect(calls()).toEqual([[0.3, "commit"]]);
      expect(readout()).toHaveTextContent("3.0");
    });

    it("keeps the current value when the catalog has no default", () => {
      renderKnob({ value: 0.9, defaultValue: null });
      fireEvent.doubleClick(knob());
      expect(onChange).not.toHaveBeenCalled();
      expect(readout()).toHaveTextContent("9.0");
    });
  });

  describe("typed entry", () => {
    const entry = () => screen.getByRole("textbox", { name: /gain value/i });

    it("opens on double-click of the readout and applies the 0-10 value", () => {
      renderKnob();
      fireEvent.doubleClick(readout());
      expect(entry()).toHaveValue("5.0");
      expect(entry()).toHaveFocus();
      fireEvent.change(entry(), { target: { value: "7.5" } });
      fireEvent.keyDown(entry(), { key: "Enter" });

      expect(calls()).toEqual([[0.75, "commit"]]);
      expect(screen.queryByRole("textbox")).toBeNull();
      expect(readout()).toHaveTextContent("7.5");
      expect(knob()).toHaveFocus();
    });

    it("opens with Enter on the focused knob", () => {
      renderKnob();
      knob().focus();
      fireEvent.keyDown(knob(), { key: "Enter" });
      expect(entry()).toBeInTheDocument();
    });

    it.each([
      ["12", 1],
      ["-3", 0],
      ["2,5", 0.25],
    ])("clamps/normalises %s to %s", (typed, expected) => {
      renderKnob();
      fireEvent.doubleClick(readout());
      fireEvent.change(entry(), { target: { value: typed } });
      fireEvent.keyDown(entry(), { key: "Enter" });
      expect(calls()).toEqual([[expected, "commit"]]);
    });

    it("ignores text that is not a number", () => {
      renderKnob();
      fireEvent.doubleClick(readout());
      fireEvent.change(entry(), { target: { value: "loud" } });
      fireEvent.keyDown(entry(), { key: "Enter" });
      expect(onChange).not.toHaveBeenCalled();
      expect(readout()).toHaveTextContent("5.0");
    });

    it("cancels with Escape", () => {
      renderKnob();
      fireEvent.doubleClick(readout());
      fireEvent.change(entry(), { target: { value: "9" } });
      fireEvent.keyDown(entry(), { key: "Escape" });
      expect(onChange).not.toHaveBeenCalled();
      expect(screen.queryByRole("textbox")).toBeNull();
      expect(readout()).toHaveTextContent("5.0");
    });

    it("applies the entry when focus leaves the field", () => {
      renderKnob();
      fireEvent.doubleClick(readout());
      fireEvent.change(entry(), { target: { value: "2" } });
      fireEvent.blur(entry());
      expect(calls()).toEqual([[0.2, "commit"]]);
    });
  });

  describe("dragging", () => {
    const down = (y: number, extra = {}) =>
      fireEvent.pointerDown(knob(), { pointerId: 1, button: 0, clientY: y, ...extra });
    const move = (y: number, extra = {}) => fireEvent.pointerMove(knob(), { pointerId: 1, clientY: y, ...extra });
    const up = (y: number) => fireEvent.pointerUp(knob(), { pointerId: 1, clientY: y });

    it("throttles live changes per knob (latest wins) and commits on release", () => {
      vi.useFakeTimers();
      renderKnob();
      down(100);
      move(90); // +0.05, first live change goes out at once
      move(80);
      move(70); // within the throttle window: only the latest survives
      expect(calls()).toEqual([[0.55, "live"]]);
      expect(knob()).toHaveAttribute("aria-valuetext", "6.5"); // display is never throttled

      act(() => {
        vi.advanceTimersByTime(LIVE_THROTTLE_MS);
      });
      expect(calls()).toEqual([
        [0.55, "live"],
        [0.65, "live"],
      ]);

      move(60);
      up(60);
      expect(calls()).toEqual([
        [0.55, "live"],
        [0.65, "live"],
        [0.7, "commit"],
      ]);

      // The commit cancelled the pending live timer.
      act(() => {
        vi.advanceTimersByTime(LIVE_THROTTLE_MS * 4);
      });
      expect(onChange).toHaveBeenCalledTimes(3);
    });

    it("uses 200 px for the full range and x0.1 with a fine modifier", () => {
      renderKnob({ value: 0 });
      down(300);
      move(200); // 100 px = half range
      move(180, { shiftKey: true }); // 20 px fine = 0.01
      up(180);
      expect(calls().slice(-1)[0]).toEqual([0.51, "commit"]);
    });

    it("does not send anything for a click without movement", () => {
      renderKnob();
      down(100);
      up(100);
      expect(onChange).not.toHaveBeenCalled();
    });

    it("follows external value changes, but not while being dragged", () => {
      const { rerender } = renderKnob();
      rerender(<AmpKnob label="Gain" value={0.8} onChange={onChange} />);
      expect(knob()).toHaveAttribute("aria-valuenow", "0.8");

      down(100);
      move(90);
      rerender(<AmpKnob label="Gain" value={0.2} onChange={onChange} />);
      expect(knob()).toHaveAttribute("aria-valuenow", "0.85");
      up(90);
      expect(calls().slice(-1)[0]).toEqual([0.85, "commit"]);

      rerender(<AmpKnob label="Gain" value={0.85} onChange={onChange} />);
      rerender(<AmpKnob label="Gain" value={0.1} onChange={onChange} />);
      expect(knob()).toHaveAttribute("aria-valuenow", "0.1");
    });

    it("cleans up timers on unmount and still delivers the last move", () => {
      vi.useFakeTimers();
      const { unmount } = renderKnob();
      down(100);
      move(90);
      move(80); // pending in the throttle window
      unmount();
      expect(calls()).toEqual([
        [0.55, "live"],
        [0.6, "commit"],
      ]);
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(onChange).toHaveBeenCalledTimes(2);
    });
  });

  // jsdom does not lay out or apply the stylesheet, so these check the rules themselves.
  describe("styles", () => {
    const css = readFileSync(join(__dirname, "../../../css/styles.css"), "utf8");
    const rule = (selector: string) => {
      const start = css.indexOf(`${selector} {`);
      expect(start).toBeGreaterThanOrEqual(0);
      return css.slice(start, css.indexOf("}", start));
    };

    it("draws keyboard focus as a solid accent outline", () => {
      const focus = rule(".amp-knob__dial:focus-visible");
      expect(focus).toMatch(/outline:\s*2px solid var\(--accent\)/);
      expect(focus).toMatch(/outline-offset:/);
      expect(focus).not.toContain("--accent-glow");
    });

    it("dims only the dial of a block that is off, not its label and value", () => {
      expect(css).not.toMatch(/\.amp-desk-inspector--off \.amp-desk-inspector__params\s*[,{]/);
      expect(css).toMatch(/\.amp-desk-inspector--off \.amp-desk-inspector__params \.amp-knob__dial svg/);
    });
  });
});
