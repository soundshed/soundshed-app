// Preset name rules shared by the rename dialog, the Save to Amp picker and the view
// model, so what the UI accepts is exactly what gets sent.
//
// 40 characters is the limit of the official app's name field (also SparkBox's
// STR_LEN). Only printable ASCII is accepted: the amp's handling of UTF-8 is
// undocumented and the reader turns every byte outside 0x20-0x7E into a space, so a
// name like "クリーン" would come back as spaces.

export const PRESET_NAME_MAX_LENGTH = 40;

export type PresetNameError = "empty" | "too-long" | "characters";

const PRINTABLE_ASCII = /^[\x20-\x7E]*$/;

export function validatePresetName(
  raw: string
): { ok: true; name: string } | { ok: false; error: PresetNameError; name: string } {
  const name = (raw ?? "").trim();

  if (name.length == 0) return { ok: false, error: "empty", name };
  if (!PRINTABLE_ASCII.test(name)) return { ok: false, error: "characters", name };
  // ASCII only, so characters and bytes are the same count here
  if (name.length > PRESET_NAME_MAX_LENGTH) return { ok: false, error: "too-long", name };

  return { ok: true, name };
}

export function presetNameErrorText(e: PresetNameError): string {
  switch (e) {
    case "empty":
      return "Enter a name.";
    case "too-long":
      return `Use ${PRESET_NAME_MAX_LENGTH} characters or fewer.`;
    case "characters":
      return "Use letters, numbers and basic symbols (A–Z, 0–9, - _ . etc.). The amp shows other characters as spaces.";
  }
}
