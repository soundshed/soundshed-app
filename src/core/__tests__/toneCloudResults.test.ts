// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppViewModel } from "../appViewModel";
import { SparkAPI } from "../../spork/src/devices/spark/sparkAPI";

// The fields that matter here, in the shape the PG ToneCloud API returns them.
const preset = (creator: object) => ({
  id: "preset-1",
  name: "Test Tone",
  category: "Rock",
  num_downloads: 1234,
  creator,
});

const creator = { _id: "u1", id: "u1", userprofile: { _id: "p1", full_name: "Jane Doe" } };

const loadToneCloud = (presets: object[], preferCached = false) => {
  vi.spyOn(SparkAPI.prototype, "getToneCloudPresets").mockResolvedValue(presets);
  return new AppViewModel().loadLatestToneCloudTones(preferCached);
};

describe("ToneCloud results", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("shows the creator's name and the download count", async () => {
    const [tone] = await loadToneCloud([preset(creator)]);

    expect(tone.author).toBe("Jane Doe");
    expect(tone.downloadCount).toBe(1234);
  });

  it("leaves the author out rather than showing [object Object]", async () => {
    const [tone] = await loadToneCloud([preset({ _id: "u1", id: "u1" })]);

    expect(tone.author).toBeNull();
  });

  it("ignores results cached before this fix", async () => {
    localStorage.setItem("_tcResults", JSON.stringify([{ name: "Old", author: "[object Object]" }]));

    const [tone] = await loadToneCloud([preset(creator)], true);

    expect(tone.author).toBe("Jane Doe");
  });
});
