import { describe, it, expect } from "vitest";
import { isSpark2DeviceName, getPresetSlotsForDeviceName } from "../sparkModels";

describe("isSpark2DeviceName", () => {
    it.each([
        "Spark 2 BLE",
        "Spark 2 Audio",
        "spark 2",
        "Spark-2",
        "Spark2",
        "SPARK 2 BLE",
        "Spark 2 (TCP Simulator)"
    ])("recognises %s as a Spark 2", (name) => {
        expect(isSpark2DeviceName(name)).toBe(true);
    });

    it.each([
        "Spark 40 BLE",
        "Spark 40 Audio",
        "Spark MINI BLE",
        "Spark Mini",
        "Spark GO BLE",
        "Spark GO",
        "Spark NEO BLE",
        "Spark LIVE",
        "Spark CONTROL X"
    ])("does not treat %s as a Spark 2", (name) => {
        expect(isSpark2DeviceName(name)).toBe(false);
    });

    it("does not match a longer number that merely starts with 2", () => {
        expect(isSpark2DeviceName("Spark 20")).toBe(false);
        expect(isSpark2DeviceName("Spark 250")).toBe(false);
    });

    it("handles a missing name", () => {
        expect(isSpark2DeviceName(null)).toBe(false);
        expect(isSpark2DeviceName(undefined)).toBe(false);
        expect(isSpark2DeviceName("")).toBe(false);
    });
});

describe("getPresetSlotsForDeviceName", () => {
    it("gives a Spark 2 eight slots", () => {
        expect(getPresetSlotsForDeviceName("Spark 2 BLE")).toBe(8);
    });

    it.each(["Spark 40 BLE", "Spark MINI BLE", "Spark GO BLE", "Spark NEO BLE"])(
        "gives %s four slots",
        (name) => {
            expect(getPresetSlotsForDeviceName(name)).toBe(4);
        }
    );

    it("defaults to four slots for an unknown or missing device", () => {
        expect(getPresetSlotsForDeviceName("Some Other Amp")).toBe(4);
        expect(getPresetSlotsForDeviceName(null)).toBe(4);
    });
});
