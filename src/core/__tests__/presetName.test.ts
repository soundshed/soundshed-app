import { describe, expect, it } from "vitest";
import { PRESET_NAME_MAX_LENGTH, presetNameErrorText, validatePresetName } from "../presetName";

// The amp's name field takes up to 40 characters, and the reader turns any byte outside
// printable ASCII into a space, so only names that come back unchanged are accepted.

describe("validatePresetName", () => {
  it("trims the name", () => {
    expect(validatePresetName("  Clean Machine  ")).toEqual({ ok: true, name: "Clean Machine" });
  });

  it.each([[""], ["   "]])("rejects %j as empty", (raw) => {
    expect(validatePresetName(raw)).toMatchObject({ ok: false, error: "empty" });
  });

  it("accepts exactly 40 characters and rejects 41", () => {
    expect(PRESET_NAME_MAX_LENGTH).toBe(40);
    expect(validatePresetName("x".repeat(40))).toEqual({ ok: true, name: "x".repeat(40) });
    expect(validatePresetName("x".repeat(41))).toMatchObject({ ok: false, error: "too-long" });
  });

  it("counts the length after trimming", () => {
    expect(validatePresetName("  " + "x".repeat(40) + "  ").ok).toBe(true);
  });

  it("allows parentheses and basic symbols", () => {
    expect(validatePresetName("Clean (Live)")).toEqual({ ok: true, name: "Clean (Live)" });
    expect(validatePresetName("Lead #2 - 80's_v1.0!").ok).toBe(true);
  });

  it.each([["クリーン"], ["Café"], ["Tab\there"], ["New\nline"]])("rejects %j as characters", (raw) => {
    expect(validatePresetName(raw)).toMatchObject({ ok: false, error: "characters" });
  });

  it("has a message for every error", () => {
    expect(presetNameErrorText("empty")).toBe("Enter a name.");
    expect(presetNameErrorText("too-long")).toBe("Use 40 characters or fewer.");
    expect(presetNameErrorText("characters")).toMatch(/other characters as spaces/);
  });
});
