import { describe, it, expect } from "vitest";
import { existsSync } from "fs";
import { join } from "path";
import { FxCatalogProvider } from "../../spork/src/devices/spark/sparkFxCatalog";
import {
    FX_MODEL_CATEGORIES,
    TRADEMARK_DISCLAIMER,
    fallbackImageUrlFor,
    getModelInfo,
    getParamKind,
    getSwitchLabels,
    imageUrlFor,
    knownFxModelIds,
    normalizeFxDspId,
} from "../fxModelInfo";

const catalog = FxCatalogProvider.getFxCatalog().catalog;
const liveModels = catalog.filter(c => !c.isRemoved);
const removedModels = catalog.filter(c => c.isRemoved);

// Image file names: letters, digits and dashes only, so they are safe as a URL path segment.
const SLUG_FORMAT = /^[A-Za-z0-9][A-Za-z0-9-]*$/;

describe("fx model info: catalog coverage", () => {
    it.each(liveModels.map(c => [c.dspId, c.type]))("has metadata for %s", (dspId, type) => {
        const info = getModelInfo(dspId);

        expect(info.isKnown).toBe(true);
        expect(info.dspId).toBe(normalizeFxDspId(dspId));
        expect(info.type).toBe(type);
        expect(info.slug).toMatch(SLUG_FORMAT);
        expect(info.slug).not.toMatch(/^fallback-/);
        expect(FX_MODEL_CATEGORIES[info.type]).toContain(info.category);
    });

    it("only describes models that are in the catalog and not removed", () => {
        const live = new Set(liveModels.map(c => normalizeFxDspId(c.dspId)));
        expect(knownFxModelIds().filter(id => !live.has(id))).toEqual([]);
    });

    it("gives removed models the fallback image for their slot", () => {
        expect(removedModels.length).toBeGreaterThan(0);
        for (const item of removedModels) {
            const info = getModelInfo(item.dspId, item.type);
            expect(info.isKnown).toBe(false);
            expect(info.type).toBe(item.type);
            expect(info.slug).toBe(item.type == "amp" ? "fallback-amp" : "fallback-pedal");
        }
    });

    it("only claims real gear for official or inferred mappings", () => {
        for (const id of knownFxModelIds()) {
            const info = getModelInfo(id);
            if (info.mappingSource == "none") expect(info.inspiredBy).toBeUndefined();
            else expect(info.inspiredBy).toBeTruthy();
        }
    });
});

describe("getModelInfo", () => {
    it("accepts prefixed and unprefixed ids", () => {
        const prefixed = getModelInfo("pg.spark40.Plexi");
        const plain = getModelInfo("Plexi");

        expect(prefixed).toBe(plain);
        expect(plain.dspId).toBe("Plexi");
        expect(plain.type).toBe("amp");
        expect(plain.slug).toBe("Plexi");
        expect(plain.category).toBe("Crunch");
        expect(plain.inspiredBy).toContain("Marshall");
        expect(plain.mappingSource).toBe("official");
    });

    it("maps ids that are not valid file names to their image slug", () => {
        expect(getModelInfo("AC Boost").slug).toBe("AC-Boost");
        expect(getModelInfo("pg.spark40.JH.Vox846").slug).toBe("JH-Vox846");
        expect(getModelInfo("bias.noisegate").slug).toBe("bias-noisegate");
        expect(getModelInfo("bias.reverb.7").slug).toBe("reverb-plate");
    });

    it("flags the Hendrix pack", () => {
        expect(getModelInfo("JH.SoundCity100").isHendrixPack).toBe(true);
        expect(getModelInfo("JH.SoundCity100").category).toBe("Hendrix pack");
        expect(getModelInfo("JH.Octavia").category).toBe("Fuzz");
        expect(getModelInfo("Twin").isHendrixPack).toBe(false);
    });

    it("keeps inferred mappings distinguishable from official ones", () => {
        expect(getModelInfo("Overdrive").mappingSource).toBe("inferred");
        expect(getModelInfo("DistortionTS9").mappingSource).toBe("inferred");
        expect(getModelInfo("Booster").mappingSource).toBe("official");
        expect(getModelInfo("BassComp").mappingSource).toBe("none");
        expect(getModelInfo("Acoustic").mappingSource).toBe("none");
    });

    // "official" text is shown unhedged, so it must be the gear PG's own lists name,
    // not a more specific unit from our research.
    it.each([
        ["Fuzz", "Dunlop Germanium Fuzz Face"],
        ["TrebleBooster", "PisoTones RangeMaster"],
        ["AcousticAmpV2", "Fishman acoustic amp"],
    ])("uses Positive Grid's wording for official %s", (dspId, gear) => {
        const info = getModelInfo(dspId);
        expect(info.mappingSource).toBe("official");
        expect(info.inspiredBy).toBe(gear);
    });

    it("does not call the original Fuzz Face photo an exact match for the Dunlop reissue", () => {
        expect(getModelInfo("Fuzz").referenceMatch).toBe("approximate");
    });

    it("falls back to the slot type for unknown ids", () => {
        const amp = getModelInfo("pg.spark40.FutureAmp9000", "amp");
        expect(amp).toMatchObject({ dspId: "FutureAmp9000", type: "amp", slug: "fallback-amp", isKnown: false, mappingSource: "none" });
        expect(amp.inspiredBy).toBeUndefined();
        expect(amp.referenceUrl).toBeUndefined();

        expect(getModelInfo("FutureDelay", "delay")).toMatchObject({ type: "delay", slug: "fallback-pedal", isKnown: false });
        expect(getModelInfo("Whatever")).toMatchObject({ type: null, slug: "fallback-pedal", isKnown: false });
        expect(getModelInfo("Whatever", "not-a-slot").type).toBeNull();
        expect(getModelInfo("JH.Future", "drive").isHendrixPack).toBe(true);
    });

    it("treats unlisted reverb ids as a generic reverb", () => {
        expect(getModelInfo("bias.reverb")).toMatchObject({ type: "reverb", slug: "reverb-hall", isKnown: false });
        expect(getModelInfo("pg.spark40.bias.reverb.9", "reverb").slug).toBe("reverb-hall");
    });

    it("tolerates empty ids", () => {
        expect(getModelInfo(null, "gate")).toMatchObject({ dspId: "", type: "gate", slug: "fallback-pedal" });
        expect(getModelInfo(undefined).isKnown).toBe(false);
    });
});

describe("image urls", () => {
    it("builds image paths from the slug", () => {
        expect(imageUrlFor("pg.spark40.Rectifier", "amp")).toBe("images/fx/Rectifier.webp");
        expect(imageUrlFor("bias.reverb.2")).toBe("images/fx/reverb-chamber.webp");
        expect(imageUrlFor("Nope", "amp")).toBe("images/fx/fallback-amp.webp");
        expect(imageUrlFor("Nope", "modulation")).toBe("images/fx/fallback-pedal.webp");
    });

    it("has generic images for failed loads", () => {
        expect(fallbackImageUrlFor("amp")).toBe("images/fx/fallback-amp.webp");
        expect(fallbackImageUrlFor("drive")).toBe("images/fx/fallback-pedal.webp");
        expect(fallbackImageUrlFor(null)).toBe("images/fx/fallback-pedal.webp");
    });
});

describe("bundled model images", () => {
    // urls are relative to the page, which is served from the repo root (build/ in the app)
    const exists = (url: string) => existsSync(join(__dirname, "../../..", url));

    it("has an image for every catalog model and both fallbacks", () => {
        const missing = knownFxModelIds()
            .map(id => imageUrlFor(id))
            .concat(fallbackImageUrlFor("amp"), fallbackImageUrlFor("drive"))
            .filter(url => !exists(url));
        expect(missing).toEqual([]);
    });
});

describe("reference photos", () => {
    // Files the licence review rejected; they must never be linked.
    const EXCLUDED_FILES = [
        "JTM_45_MK_II_Reissue_1997",
        "Jimi_Hendrix_playing_Sound_City",
        "File:OD-3.JPG",
        "Sunn2.jpg",
        "Boss_CS-1",
        "Boss_DD-3",
        "Boss_OD-3",
        "Gibson_maestro_fuzz_tone",
        "Ibanez_ts9",
    ];

    it.each(["OverDrivenJM45", "JH.JTM45", "JH.SoundCity100", "BlueComp", "JH.FuzzTone", "DistortionTS9", "DelayMono", "Overdrive"])(
        "has no reference photo for %s",
        (dspId) => {
            expect(getModelInfo(dspId).referenceUrl).toBeUndefined();
            expect(getModelInfo(dspId).referenceMatch).toBeUndefined();
        }
    );

    it("never links an excluded file", () => {
        for (const id of knownFxModelIds()) {
            const url = getModelInfo(id).referenceUrl;
            if (!url) continue;
            for (const file of EXCLUDED_FILES) expect(url).not.toContain(file);
        }
    });

    it("links Commons file pages with a match quality", () => {
        const withPhoto = knownFxModelIds().map(id => getModelInfo(id)).filter(i => i.referenceUrl);
        expect(withPhoto.length).toBeGreaterThan(0);
        for (const info of withPhoto) {
            expect(info.referenceUrl).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
            expect(["exact", "approximate"]).toContain(info.referenceMatch);
            expect(info.mappingSource).not.toBe("none");
        }
        expect(getModelInfo("RolandJC120").referenceMatch).toBe("exact");
        expect(getModelInfo("Bogner").referenceMatch).toBe("approximate");
    });
});

describe("param kinds", () => {
    it("marks the Hendrix wah and delay BPM params as switches", () => {
        expect(getParamKind("pg.spark40.JH.Vox846", 1)).toBe("switch");
        expect(getParamKind("JH.Vox846", 0)).toBe("knob");
        expect(getParamKind("DelayMono", 4)).toBe("switch");
        expect(getParamKind("VintageDelay", 3)).toBe("switch");
        expect(getSwitchLabels("DelayRe201", 4)).toEqual({ off: "Off", on: "On" });
    });

    it("keeps multi-position selectors and unknown models as knobs", () => {
        expect(getParamKind("DelayMono", 3)).toBe("knob");
        expect(getParamKind("DelayMultiHead", 3)).toBe("knob");
        expect(getParamKind("JH.VoodooVibeJr", 3)).toBe("knob");
        expect(getParamKind("Unknown", 0)).toBe("knob");
        expect(getSwitchLabels("Plexi", 0)).toBeUndefined();
    });

    it("only marks params that exist in the catalog", () => {
        for (const id of knownFxModelIds()) {
            const info = getModelInfo(id);
            const item = catalog.find(c => normalizeFxDspId(c.dspId) == id);
            for (const index of Object.keys(info.paramKinds ?? {})) {
                expect(item.params.map(p => p.index)).toContain(Number(index));
                expect(info.switchLabels?.[Number(index)]).toBeDefined();
            }
        }
    });

    it("treats every catalog BPM param as a switch", () => {
        const bpmParams = liveModels.flatMap(c => c.params.filter(p => p.name == "BPM").map(p => [c.dspId, p.index] as [string, number]));
        expect(bpmParams.length).toBeGreaterThan(0);
        for (const [dspId, index] of bpmParams) expect(getParamKind(dspId, index)).toBe("switch");
    });
});

describe("trademark disclaimer", () => {
    it("is exported for the UI", () => {
        expect(TRADEMARK_DISCLAIMER).toMatch(/trademarks of their respective owners/);
        expect(TRADEMARK_DISCLAIMER).toMatch(/no affiliation or endorsement is implied/);
    });
});
