// Display metadata for Spark fx models: image, browser category, the real gear that
// inspired the model and which params are on/off switches rather than knobs.
//
// The protocol-facing catalog (src/spork/.../sparkFxCatalog.ts) stays the source of truth
// for which models exist and their params; this table only adds what the amp screen needs
// to present them. Everything is embedded so nothing is read from disk at runtime.
//
// Sources:
// - slug: the image file name, images/fx/<slug>.webp (the reverb variants share four images).
// - inspiredBy / mappingSource: research/gear-photos.tsv. "official" means Positive Grid's
//   own Spark or BIAS FX 2 effect list names the gear; "inferred" means the link only comes
//   from the dspId or a near-match name, so the UI should hedge it ("possibly ..."); "none"
//   means a PG original or nothing could be found. An "official" inspiredBy uses PG's own
//   wording (e.g. "Fishman acoustic amp", not a specific Fishman model we guessed).
// - referenceUrl: a Wikimedia Commons file page, only for exact/approximate photo matches,
//   excluding files the licence review rejected (GFDL-only JTM45 reissue, Boss pedal photos
//   with unclear authorship, the Maestro Fuzz-Tone and Ibanez TS9 files). Linked, never bundled.
// - category: chosen by each model's character (for amps the gain range the model is voiced
//   for at default settings; for effects the kind of effect). The Hendrix expansion amps are
//   grouped as their own pack; the Hendrix pedals sit with their effect kind.
// - switches: params Spark draws as two-position switches, cross-checked against the
//   PGSparkLite effect layouts (on = value 1). Multi-position selectors such as the delay
//   "Mode" params stay knobs. Kept deliberately short: a knob drawn as a switch would lose
//   every in-between value.

export type FxSlotType = "gate" | "comp" | "drive" | "amp" | "modulation" | "delay" | "reverb";

export type FxMappingSource = "official" | "inferred" | "none";

export type FxParamKind = "knob" | "switch";

export interface FxSwitchLabels {
    /** Label for value 0 */
    off: string;
    /** Label for value 1 */
    on: string;
}

export interface FxModelInfo {
    /** dspId without the "pg.spark40." prefix */
    dspId: string;
    /** Slot type, or null for an unknown model whose slot was not given */
    type: FxSlotType | null;
    /** Image file name without extension, see imageUrlFor */
    slug: string;
    /** Browser category, one of FX_MODEL_CATEGORIES[type] for known models */
    category: string;
    /** Real gear the model is modelled on, absent for PG originals and unknown models */
    inspiredBy?: string;
    mappingSource: FxMappingSource;
    /** Wikimedia Commons file page of a reference photo, to open externally */
    referenceUrl?: string;
    /** Whether the reference photo shows the exact unit or a related one */
    referenceMatch?: "exact" | "approximate";
    /** Param index -> kind, only listing non-knob params */
    paramKinds?: Readonly<Record<number, FxParamKind>>;
    /** Labels for the two positions of each switch param */
    switchLabels?: Readonly<Record<number, FxSwitchLabels>>;
    /** Part of the Jimi Hendrix expansion pack (dspId starts with "JH.") */
    isHendrixPack: boolean;
    /** False when the dspId is not in the table and a fallback was returned */
    isKnown: boolean;
}

type ModelRow = Pick<FxModelInfo, "slug" | "category" | "inspiredBy" | "mappingSource" | "referenceUrl" | "referenceMatch"> & { type: FxSlotType };

export const TRADEMARK_DISCLAIMER =
    "Product names are trademarks of their respective owners and are used only to identify the gear that inspired each model; no affiliation or endorsement is implied.";

export const FX_IMAGE_BASE = "images/fx/";
export const FALLBACK_AMP_SLUG = "fallback-amp";
export const FALLBACK_PEDAL_SLUG = "fallback-pedal";

const DSP_ID_PREFIX = "pg.spark40.";

/** Category chips per slot type, in display order. */
export const FX_MODEL_CATEGORIES: Readonly<Record<FxSlotType, readonly string[]>> = {
    gate: ["Noise Gate"],
    comp: ["Compressor", "Wah"],
    drive: ["Boost", "Overdrive", "Distortion", "Fuzz"],
    amp: ["Clean", "Crunch", "High Gain", "Bass", "Acoustic", "Hendrix pack"],
    modulation: ["Chorus", "Flanger", "Phaser", "Tremolo", "Vibrato", "EQ"],
    delay: ["Digital", "Analog", "Tape", "Reverse"],
    reverb: ["Room", "Chamber", "Hall", "Plate"],
};

const SLOT_TYPES = Object.keys(FX_MODEL_CATEGORIES) as FxSlotType[];

const MODELS: Readonly<Record<string, ModelRow>> = {
    // Amps
    "RolandJC120": { type: "amp", slug: "RolandJC120", category: "Clean", inspiredBy: "Roland JC-120 Jazz Chorus", mappingSource: "official", referenceUrl: "https://commons.wikimedia.org/wiki/File:JC-120UT.jpg", referenceMatch: "exact" },
    "Twin": { type: "amp", slug: "Twin", category: "Clean", inspiredBy: "Fender Twin Reverb", mappingSource: "official", referenceUrl: "https://commons.wikimedia.org/wiki/File:1973_Twin_Reverb.jpg", referenceMatch: "exact" },
    "ADClean": { type: "amp", slug: "ADClean", category: "Clean", inspiredBy: "Orange AD30", mappingSource: "official", referenceUrl: "https://commons.wikimedia.org/wiki/File:Wzmacniacz_gitarowy_AD30HTC_firmy_Orange.jpg", referenceMatch: "exact" },
    "94MatchDCV2": { type: "amp", slug: "94MatchDCV2", category: "Clean", inspiredBy: "Matchless DC-30", mappingSource: "official", referenceUrl: "https://commons.wikimedia.org/wiki/File:Matchless_hc-30.jpg", referenceMatch: "approximate" },
    "Bassman": { type: "amp", slug: "Bassman", category: "Crunch", inspiredBy: "Fender Bassman (tweed)", mappingSource: "official", referenceUrl: "https://commons.wikimedia.org/wiki/File:Fender_Bassman_RI_miked_up_with_a_Cascade_Fat_Head%2C_Sennheiser_MD_441%2C_and_RODE_NT1%2C_Recording_Fischer%2C_Compound_Recordings%2C_January_2008.jpg", referenceMatch: "exact" },
    "AC Boost": { type: "amp", slug: "AC-Boost", category: "Crunch", inspiredBy: "Vox AC30", mappingSource: "official", referenceUrl: "https://commons.wikimedia.org/wiki/File:VOX_AC30_Top_Boost_%28Born_to_Rock%29_clipped.jpg", referenceMatch: "exact" },
    "Checkmate": { type: "amp", slug: "Checkmate", category: "Crunch", inspiredBy: "Teisco Checkmate 20", mappingSource: "official", referenceUrl: "https://commons.wikimedia.org/wiki/File:Teisco_Checkmate_100.png", referenceMatch: "approximate" },
    "TwoStoneSP50": { type: "amp", slug: "TwoStoneSP50", category: "Clean", inspiredBy: "Two-Rock Studio Pro 50", mappingSource: "official" },
    "Deluxe65": { type: "amp", slug: "Deluxe65", category: "Crunch", inspiredBy: "Fender '57 Custom Deluxe (tweed Deluxe 5E3)", mappingSource: "official", referenceUrl: "https://commons.wikimedia.org/wiki/File:Fender1953Deluxe.jpg", referenceMatch: "approximate" },
    "Plexi": { type: "amp", slug: "Plexi", category: "Crunch", inspiredBy: "Marshall Super Lead 100 (1959 'Plexi')", mappingSource: "official", referenceUrl: "https://commons.wikimedia.org/wiki/File:Wzmacniacz_gitarowy_%28head%29_1959SLP-01_firmy_Marshall.jpg", referenceMatch: "exact" },
    "OverDrivenJM45": { type: "amp", slug: "OverDrivenJM45", category: "Crunch", inspiredBy: "Marshall JTM45", mappingSource: "official" },
    "OverDrivenLuxVerb": { type: "amp", slug: "OverDrivenLuxVerb", category: "Crunch", inspiredBy: "Fender Deluxe Reverb", mappingSource: "official", referenceUrl: "https://commons.wikimedia.org/wiki/File:Fender_Deluxe_Reverb_Amp_%28by_cptbuzz%29.jpg", referenceMatch: "exact" },
    "Bogner": { type: "amp", slug: "Bogner", category: "Crunch", inspiredBy: "Bogner Ecstasy 101", mappingSource: "official", referenceUrl: "https://commons.wikimedia.org/wiki/File:Bogner_Shiva_Amp_by_MusicTales_01.jpg", referenceMatch: "approximate" },
    "OrangeAD30": { type: "amp", slug: "OrangeAD30", category: "Crunch", inspiredBy: "Orange AD30", mappingSource: "official", referenceUrl: "https://commons.wikimedia.org/wiki/File:Wzmacniacz_gitarowy_AD30HTC_firmy_Orange.jpg", referenceMatch: "exact" },
    "AmericanHighGain": { type: "amp", slug: "AmericanHighGain", category: "High Gain", inspiredBy: "Mesa/Boogie JP-2C", mappingSource: "official", referenceUrl: "https://commons.wikimedia.org/wiki/File:MarkIV.jpg", referenceMatch: "approximate" },
    "SLO100": { type: "amp", slug: "SLO100", category: "High Gain", inspiredBy: "Soldano SLO-100", mappingSource: "official", referenceUrl: "https://commons.wikimedia.org/wiki/File:Soldano_Decatone%2BSLO100.jpg", referenceMatch: "exact" },
    "YJM100": { type: "amp", slug: "YJM100", category: "High Gain", inspiredBy: "Marshall YJM100", mappingSource: "official" },
    "Rectifier": { type: "amp", slug: "Rectifier", category: "High Gain", inspiredBy: "Mesa/Boogie Triple Rectifier", mappingSource: "official", referenceUrl: "https://commons.wikimedia.org/wiki/File:Triple_Rectifier_Solo_Head.jpg", referenceMatch: "exact" },
    "EVH": { type: "amp", slug: "EVH", category: "High Gain", inspiredBy: "EVH 5150 III", mappingSource: "official", referenceUrl: "https://commons.wikimedia.org/wiki/File:EVH_5150III_details.jpg", referenceMatch: "exact" },
    "SwitchAxeLead": { type: "amp", slug: "SwitchAxeLead", category: "High Gain", inspiredBy: "Hughes & Kettner Switchblade", mappingSource: "official", referenceUrl: "https://commons.wikimedia.org/wiki/File:Hughes_%26_Kettner_head_%40_FUZZ_Guitar_Show_2008.jpg", referenceMatch: "approximate" },
    "Invader": { type: "amp", slug: "Invader", category: "High Gain", inspiredBy: "Orange Rockerverb 50", mappingSource: "official", referenceUrl: "https://commons.wikimedia.org/wiki/File:JaguarLes_Paul_%2B_Orange_Rig.jpg", referenceMatch: "exact" },
    "BE101": { type: "amp", slug: "BE101", category: "High Gain", inspiredBy: "Friedman BE-100", mappingSource: "official" },
    "Acoustic": { type: "amp", slug: "Acoustic", category: "Acoustic", mappingSource: "none" },
    "AcousticAmpV2": { type: "amp", slug: "AcousticAmpV2", category: "Acoustic", inspiredBy: "Fishman acoustic amp", mappingSource: "official" },
    "FatAcousticV2": { type: "amp", slug: "FatAcousticV2", category: "Acoustic", mappingSource: "none" },
    "FlatAcoustic": { type: "amp", slug: "FlatAcoustic", category: "Acoustic", mappingSource: "none" },
    "GK800": { type: "amp", slug: "GK800", category: "Bass", inspiredBy: "Gallien-Krueger 800RB", mappingSource: "official", referenceUrl: "https://commons.wikimedia.org/wiki/File:Yamaha_BB3000AF_%26_GK_700RB.jpg", referenceMatch: "approximate" },
    "Sunny3000": { type: "amp", slug: "Sunny3000", category: "Bass", inspiredBy: "Sunn 300T", mappingSource: "official" },
    "W600": { type: "amp", slug: "W600", category: "Bass", inspiredBy: "Eden WTP600", mappingSource: "official", referenceUrl: "https://commons.wikimedia.org/wiki/File:Eden_WT800_Bass_Amplifier.jpg", referenceMatch: "approximate" },
    "Hammer500": { type: "amp", slug: "Hammer500", category: "Bass", inspiredBy: "Aguilar Tone Hammer 500", mappingSource: "official", referenceUrl: "https://commons.wikimedia.org/wiki/File:Bass_amps_with_cabinets_-_Fender_cab%2C_Genz-Benz_head_%26_cab%2C_Aguilar_head_%26_cab_%28by_Don_Wright%29.jpg", referenceMatch: "approximate" },
    "6505Plus": { type: "amp", slug: "6505Plus", category: "High Gain", inspiredBy: "Peavey 6505", mappingSource: "official", referenceUrl: "https://commons.wikimedia.org/wiki/File:Peavey_6505_amp_%28cropped%29.jpg", referenceMatch: "exact" },
    "ODS50CN": { type: "amp", slug: "ODS50CN", category: "Clean", inspiredBy: "Dumble Overdrive Special 50", mappingSource: "official", referenceUrl: "https://commons.wikimedia.org/wiki/File:Dumble_ODS_50W_Combo.jpg", referenceMatch: "exact" },
    "BluesJrTweed": { type: "amp", slug: "BluesJrTweed", category: "Clean", inspiredBy: "Fender Blues Junior", mappingSource: "official", referenceUrl: "https://commons.wikimedia.org/wiki/File:Fender_blues_junior_blonde.jpg", referenceMatch: "approximate" },
    "JH.JTM45": { type: "amp", slug: "JH-JTM45", category: "Hendrix pack", inspiredBy: "Marshall JTM45/100", mappingSource: "official" },
    "JH.SuperLead100": { type: "amp", slug: "JH-SuperLead100", category: "Hendrix pack", inspiredBy: "Marshall Super Lead 100 (1959)", mappingSource: "official", referenceUrl: "https://commons.wikimedia.org/wiki/File:Wzmacniacz_gitarowy_%28head%29_1959SLP-01_firmy_Marshall.jpg", referenceMatch: "exact" },
    "JH.DualShowman": { type: "amp", slug: "JH-DualShowman", category: "Hendrix pack", inspiredBy: "Fender Dual Showman", mappingSource: "official", referenceUrl: "https://commons.wikimedia.org/wiki/File:Expo_Pink_Floyd_-_Fender_Amp.jpg", referenceMatch: "approximate" },
    "JH.Sunn100": { type: "amp", slug: "JH-Sunn100", category: "Hendrix pack", inspiredBy: "Sunn 100S", mappingSource: "official" },
    "JH.Bassman50Silver": { type: "amp", slug: "JH-Bassman50Silver", category: "Hendrix pack", inspiredBy: "Fender 1968 Bassman 50", mappingSource: "official", referenceUrl: "https://commons.wikimedia.org/wiki/File:Fender_vahvistin.jpg", referenceMatch: "exact" },
    "JH.SoundCity100": { type: "amp", slug: "JH-SoundCity100", category: "Hendrix pack", inspiredBy: "Sound City One Hundred", mappingSource: "official" },

    // Comp slot (compressors and the Hendrix wah)
    "LA2AComp": { type: "comp", slug: "LA2AComp", category: "Compressor", inspiredBy: "Teletronix LA-2A", mappingSource: "official", referenceUrl: "https://commons.wikimedia.org/wiki/File:LA-2A%2C_1176%2C_Distressors%2C_PCM_196.jpg", referenceMatch: "exact" },
    "BlueComp": { type: "comp", slug: "BlueComp", category: "Compressor", inspiredBy: "Boss CS-1 Compression Sustainer", mappingSource: "official" },
    "Compressor": { type: "comp", slug: "Compressor", category: "Compressor", inspiredBy: "MXR Dyna Comp", mappingSource: "official", referenceUrl: "https://commons.wikimedia.org/wiki/File:MXR_M-102_Dyna_Comp.jpg", referenceMatch: "exact" },
    "BassComp": { type: "comp", slug: "BassComp", category: "Compressor", mappingSource: "none" },
    "BBEOpticalComp": { type: "comp", slug: "BBEOpticalComp", category: "Compressor", inspiredBy: "BBE Opto Stomp", mappingSource: "official" },
    "JH.Vox846": { type: "comp", slug: "JH-Vox846", category: "Wah", inspiredBy: "Vox V846 wah-wah", mappingSource: "official", referenceUrl: "https://commons.wikimedia.org/wiki/File:1968_King_Vox_Wah_pedal.JPG", referenceMatch: "approximate" },

    // Delays
    "DelayMono": { type: "delay", slug: "DelayMono", category: "Digital", inspiredBy: "Boss DD-3", mappingSource: "inferred" },
    "DelayEchoFilt": { type: "delay", slug: "DelayEchoFilt", category: "Digital", mappingSource: "none" },
    "VintageDelay": { type: "delay", slug: "VintageDelay", category: "Analog", mappingSource: "none" },
    "DelayReverse": { type: "delay", slug: "DelayReverse", category: "Reverse", inspiredBy: "EHX Stereo Memory Man with Hazarai", mappingSource: "official", referenceUrl: "https://commons.wikimedia.org/wiki/File:Electro-Harmonix_Stereo_Memory_Man_with_Hazarai_-_front.jpg", referenceMatch: "exact" },
    "DelayMultiHead": { type: "delay", slug: "DelayMultiHead", category: "Tape", mappingSource: "none" },
    "DelayRe201": { type: "delay", slug: "DelayRe201", category: "Tape", inspiredBy: "Roland RE-201 Space Echo", mappingSource: "inferred", referenceUrl: "https://commons.wikimedia.org/wiki/File:RE201_Face.JPG", referenceMatch: "exact" },

    // Drives
    "Booster": { type: "drive", slug: "Booster", category: "Boost", inspiredBy: "Xotic RC Booster", mappingSource: "official", referenceUrl: "https://commons.wikimedia.org/wiki/File:Xotic_RC_Booster_%286967384793%29.jpg", referenceMatch: "exact" },
    "DistortionTS9": { type: "drive", slug: "DistortionTS9", category: "Overdrive", inspiredBy: "Ibanez TS9 Tube Screamer", mappingSource: "inferred" },
    "Overdrive": { type: "drive", slug: "Overdrive", category: "Overdrive", inspiredBy: "Boss OD-3", mappingSource: "inferred" },
    "Fuzz": { type: "drive", slug: "Fuzz", category: "Fuzz", inspiredBy: "Dunlop Germanium Fuzz Face", mappingSource: "official", referenceUrl: "https://commons.wikimedia.org/wiki/File:Dallas_Arbiter_Fuzz_Face.jpg", referenceMatch: "approximate" },
    "ProCoRat": { type: "drive", slug: "ProCoRat", category: "Distortion", inspiredBy: "ProCo RAT", mappingSource: "inferred", referenceUrl: "https://commons.wikimedia.org/wiki/File:ProCo_RAT_Distortion_Pedal_%282015-04-21_by_David_Hilowitz%29.jpg", referenceMatch: "exact" },
    "BassBigMuff": { type: "drive", slug: "BassBigMuff", category: "Fuzz", inspiredBy: "Electro-Harmonix Bass Big Muff Pi", mappingSource: "inferred", referenceUrl: "https://commons.wikimedia.org/wiki/File:Deluxe_Bass_Big_Muff_Pi_2020.jpg", referenceMatch: "approximate" },
    "GuitarMuff": { type: "drive", slug: "GuitarMuff", category: "Fuzz", inspiredBy: "Electro-Harmonix Big Muff Pi", mappingSource: "official", referenceUrl: "https://commons.wikimedia.org/wiki/File:Electro_Harmonix_Big_Muff_%28cropped%29.jpg", referenceMatch: "exact" },
    "MaestroBassmaster": { type: "drive", slug: "MaestroBassmaster", category: "Fuzz", inspiredBy: "Maestro Bass Brassmaster", mappingSource: "inferred" },
    "SABdriver": { type: "drive", slug: "SABdriver", category: "Overdrive", inspiredBy: "Fulltone OCD", mappingSource: "official", referenceUrl: "https://commons.wikimedia.org/wiki/File:Fulltone_OCD_v.1.jpg", referenceMatch: "exact" },
    "TrebleBooster": { type: "drive", slug: "TrebleBooster", category: "Boost", inspiredBy: "PisoTones RangeMaster", mappingSource: "official", referenceUrl: "https://commons.wikimedia.org/wiki/File:Dallas_Rangemaster_clone.jpg", referenceMatch: "approximate" },
    "KlonCentaurSilver": { type: "drive", slug: "KlonCentaurSilver", category: "Overdrive", inspiredBy: "Klon Centaur", mappingSource: "official", referenceUrl: "https://commons.wikimedia.org/wiki/File:Klon_Centaur_-_Front.jpg", referenceMatch: "exact" },
    "JH.AxisFuzz": { type: "drive", slug: "JH-AxisFuzz", category: "Fuzz", inspiredBy: "Roger Mayer Axis Fuzz", mappingSource: "official" },
    "JH.SupaFuzz": { type: "drive", slug: "JH-SupaFuzz", category: "Fuzz", inspiredBy: "Marshall Supa Fuzz (Sola Sound)", mappingSource: "official", referenceUrl: "https://commons.wikimedia.org/wiki/File:Sola_Sound_Colorsound_Supa_Tonebender%2C_from_1974.png", referenceMatch: "approximate" },
    "JH.Octavia": { type: "drive", slug: "JH-Octavia", category: "Fuzz", inspiredBy: "Roger Mayer Octavia", mappingSource: "official" },
    "JH.FuzzTone": { type: "drive", slug: "JH-FuzzTone", category: "Fuzz", inspiredBy: "Maestro FZ-1 Fuzz-Tone", mappingSource: "official" },

    // Gate
    "bias.noisegate": { type: "gate", slug: "bias-noisegate", category: "Noise Gate", mappingSource: "none" },

    // Modulation / EQ
    "Tremolo": { type: "modulation", slug: "Tremolo", category: "Tremolo", inspiredBy: "Dunlop TS-1 Stereo Tremolo", mappingSource: "official" },
    "ChorusAnalog": { type: "modulation", slug: "ChorusAnalog", category: "Chorus", inspiredBy: "MXR M134 Stereo Chorus", mappingSource: "official" },
    "Flanger": { type: "modulation", slug: "Flanger", category: "Flanger", inspiredBy: "Electro-Harmonix Electric Mistress", mappingSource: "official" },
    "Phaser": { type: "modulation", slug: "Phaser", category: "Phaser", inspiredBy: "MXR Phase 90", mappingSource: "inferred", referenceUrl: "https://commons.wikimedia.org/wiki/File:MXR_M-101_Phase_90_%28Box_logo_without_LED%29.jpg", referenceMatch: "approximate" },
    "Vibrato01": { type: "modulation", slug: "Vibrato01", category: "Vibrato", inspiredBy: "BBE Mind Bender", mappingSource: "official" },
    "UniVibe": { type: "modulation", slug: "UniVibe", category: "Vibrato", inspiredBy: "Shin-ei / Univox Uni-Vibe", mappingSource: "official", referenceUrl: "https://commons.wikimedia.org/wiki/File:Shin-ei_Uni-Vibe_%281968%29%2C_Jimi_Hendrix%2C_EMP_Museum_%28clean%29.jpg", referenceMatch: "exact" },
    "Cloner": { type: "modulation", slug: "Cloner", category: "Chorus", inspiredBy: "Electro-Harmonix Small Clone", mappingSource: "official", referenceUrl: "https://commons.wikimedia.org/wiki/File:Electro-Harmonix_Small_Clone_EH_4600_Full-Chorus.jpg", referenceMatch: "exact" },
    "MiniVibe": { type: "modulation", slug: "MiniVibe", category: "Vibrato", inspiredBy: "Voodoo Lab Micro Vibe", mappingSource: "inferred", referenceUrl: "https://commons.wikimedia.org/wiki/File:Voodoo_Lab_Microvibe_%28cropped%29.jpg", referenceMatch: "approximate" },
    "Tremolator": { type: "modulation", slug: "Tremolator", category: "Tremolo", inspiredBy: "Demeter TRM-1 Tremulator", mappingSource: "official" },
    "TremoloSquare": { type: "modulation", slug: "TremoloSquare", category: "Tremolo", mappingSource: "none" },
    "GuitarEQ6": { type: "modulation", slug: "GuitarEQ6", category: "EQ", inspiredBy: "MXR M109S Six Band EQ", mappingSource: "official" },
    "JH.VoodooVibeJr": { type: "modulation", slug: "JH-VoodooVibeJr", category: "Vibrato", inspiredBy: "Roger Mayer Voodoo-Vibe Jr.", mappingSource: "official" },

    // Reverbs (one Spark dspId with a type param; see FxMappingSparkToTone.getReverbDspId)
    "bias.reverb.0": { type: "reverb", slug: "reverb-room", category: "Room", mappingSource: "none" },
    "bias.reverb.1": { type: "reverb", slug: "reverb-room", category: "Room", mappingSource: "none" },
    "bias.reverb.2": { type: "reverb", slug: "reverb-chamber", category: "Chamber", mappingSource: "none" },
    "bias.reverb.3": { type: "reverb", slug: "reverb-hall", category: "Hall", mappingSource: "none" },
    "bias.reverb.4": { type: "reverb", slug: "reverb-hall", category: "Hall", mappingSource: "none" },
    "bias.reverb.5": { type: "reverb", slug: "reverb-hall", category: "Hall", mappingSource: "none" },
    "bias.reverb.6": { type: "reverb", slug: "reverb-plate", category: "Plate", mappingSource: "none" },
    "bias.reverb.7": { type: "reverb", slug: "reverb-plate", category: "Plate", mappingSource: "none" },
    "bias.reverb.8": { type: "reverb", slug: "reverb-plate", category: "Plate", mappingSource: "none" },
};

const BPM_SWITCH: FxSwitchLabels = { off: "Off", on: "On" };

// dspId -> param index -> switch labels. BPM switches lock the effect to the preset tempo.
const SWITCH_PARAMS: Readonly<Record<string, Readonly<Record<number, FxSwitchLabels>>>> = {
    "LA2AComp": { 0: { off: "Compress", on: "Limit" } },
    "BBEOpticalComp": { 2: { off: "0 dB", on: "-15 dB" } },
    "JH.Vox846": { 1: BPM_SWITCH },
    "SABdriver": { 3: { off: "LP", on: "HP" } },
    "UniVibe": { 1: { off: "Vibrato", on: "Chorus" } },
    "Cloner": { 1: { off: "Low", on: "High" } },
    "Tremolator": { 2: BPM_SWITCH },
    "DelayMono": { 4: BPM_SWITCH },
    "DelayEchoFilt": { 4: BPM_SWITCH },
    "VintageDelay": { 3: BPM_SWITCH },
    "DelayReverse": { 4: BPM_SWITCH },
    "DelayMultiHead": { 4: BPM_SWITCH },
    "DelayRe201": { 4: BPM_SWITCH },
};

/** Strips the "pg.spark40." prefix the catalog adds; other ids pass through unchanged. */
export function normalizeFxDspId(dspId: string | null | undefined): string {
    if (!dspId) return "";
    return dspId.startsWith(DSP_ID_PREFIX) ? dspId.substring(DSP_ID_PREFIX.length) : dspId;
}

function toSlotType(type: string | null | undefined): FxSlotType | null {
    return SLOT_TYPES.includes(type as FxSlotType) ? (type as FxSlotType) : null;
}

function buildInfo(dspId: string, row: ModelRow): FxModelInfo {
    const switches = SWITCH_PARAMS[dspId];
    const info: FxModelInfo = { dspId, ...row, isHendrixPack: dspId.startsWith("JH."), isKnown: true };
    if (switches) {
        const kinds: Record<number, FxParamKind> = {};
        for (const index of Object.keys(switches)) kinds[Number(index)] = "switch";
        info.paramKinds = Object.freeze(kinds);
        info.switchLabels = switches;
    }
    return Object.freeze(info);
}

const INFO_BY_ID: ReadonlyMap<string, FxModelInfo> = new Map(
    Object.entries(MODELS).map(([dspId, row]) => [dspId, buildInfo(dspId, row)] as [string, FxModelInfo])
);

/** Every dspId (unprefixed) that has metadata. */
export function knownFxModelIds(): string[] {
    return [...INFO_BY_ID.keys()];
}

/**
 * Metadata for a model. Accepts the dspId with or without the "pg.spark40." prefix.
 *
 * Unknown ids (models newer than this table, or ones removed from the catalog) still get a
 * usable result: the slot type comes from `fallbackType` (the slot position the block sits
 * in) and the image is the generic amp or pedal. A bare or unlisted "bias.reverb*" id is
 * treated as a generic reverb.
 */
export function getModelInfo(dspId: string | null | undefined, fallbackType?: string | null): FxModelInfo {
    const id = normalizeFxDspId(dspId);
    const known = INFO_BY_ID.get(id);
    if (known) return known;

    if (id.startsWith("bias.reverb")) {
        return { dspId: id, type: "reverb", slug: "reverb-hall", category: "Reverb", mappingSource: "none", isHendrixPack: false, isKnown: false };
    }

    const type = toSlotType(fallbackType);
    return {
        dspId: id,
        type,
        slug: type == "amp" ? FALLBACK_AMP_SLUG : FALLBACK_PEDAL_SLUG,
        category: "Other",
        mappingSource: "none",
        isHendrixPack: id.startsWith("JH."),
        isKnown: false,
    };
}

/** Image for a model, e.g. "images/fx/Plexi.webp". Falls back to the generic amp/pedal image. */
export function imageUrlFor(dspId: string | null | undefined, slotType?: string | null): string {
    return FX_IMAGE_BASE + getModelInfo(dspId, slotType).slug + ".webp";
}

/** Generic image to swap in when a model image fails to load. */
export function fallbackImageUrlFor(slotType: string | null | undefined): string {
    return FX_IMAGE_BASE + (slotType == "amp" ? FALLBACK_AMP_SLUG : FALLBACK_PEDAL_SLUG) + ".webp";
}

/** How a param should be drawn; anything not listed as a switch is a knob. */
export function getParamKind(dspId: string | null | undefined, paramIndex: number): FxParamKind {
    return getModelInfo(dspId).paramKinds?.[paramIndex] ?? "knob";
}

/** Position labels for a switch param, or undefined for knobs. */
export function getSwitchLabels(dspId: string | null | undefined, paramIndex: number): FxSwitchLabels | undefined {
    return getModelInfo(dspId).switchLabels?.[paramIndex];
}
