import { FxCatalog } from "../../interfaces/preset";

export class FxCatalogProvider {
    public static db: FxCatalog = {
        "types": [
            {
                "id": "gate",
                "name": "Gate",
                "index": 0,
                "description": "Noise Gate"
            },
            {
                "id": "comp",
                "name": "Comp",
                "index": 1,
                "description": "Compress or Sustain the input signal"
            },
            {
                "id": "drive",
                "name": "Drive",
                "index": 2,
                "description": "Overdrive or add gain to the input signal"
            },
            {
                "id": "amp",
                "name": "Amp",
                "index": 3,
                "description": "Amplifier modelling"
            },
            {
                "id": "modulation",
                "name": "Mod",
                "index": 4,
                "description": "Modulation effects"
            },
            {
                "id": "delay",
                "name": "Delay",
                "index": 5,
                "description": "Delay/echo effects"
            },
            {
                "id": "reverb",
                "name": "Reverb",
                "index": 6,
                "description": "Reverberation effects"
            }
        ],
        "catalog": [
            {
                "type": "amp",
                "dspId": "RolandJC120",
                "name": "Silver 120",
                "params": [
                    {
                        "name": "Gain",
                        "index": 0,
                        "value": 0.7
                    },
                    {
                        "name": "Bass",
                        "index": 3,
                        "value": 0.5
                    },
                    {
                        "name": "Middle",
                        "index": 2,
                        "value": 0.3
                    },
                    {
                        "name": "Treble",
                        "index": 1,
                        "value": 0.4
                    },
                    {
                        "name": "Master",
                        "index": 4,
                        "value": 0.8
                    }
                ]
            },
            {
                "type": "amp",
                "dspId": "Twin",
                "name": "Blackface Duo",
                "params": [
                    {
                        "name": "Gain",
                        "index": 0,
                        "value": 0.7
                    },
                    {
                        "name": "Bass",
                        "index": 3,
                        "value": 0.5
                    },
                    {
                        "name": "Middle",
                        "index": 2,
                        "value": 0.5
                    },
                    {
                        "name": "Treble",
                        "index": 1,
                        "value": 0.4
                    },
                    {
                        "name": "Master",
                        "index": 4,
                        "value": 0.8
                    }
                ]
            },
            {
                "type": "amp",
                "dspId": "ADClean",
                "name": "AD Clean",
                "params": [
                    {
                        "name": "Gain",
                        "index": 0,
                        "value": 0.7
                    },
                    {
                        "name": "Bass",
                        "index": 3,
                        "value": 0.3
                    },
                    {
                        "name": "Middle",
                        "index": 2,
                        "value": 0.5
                    },
                    {
                        "name": "Treble",
                        "index": 1,
                        "value": 0.6
                    },
                    {
                        "name": "Master",
                        "index": 4,
                        "value": 0.7
                    }
                ]
            },
            {
                "type": "amp",
                "dspId": "94MatchDCV2",
                "name": "Match DC",
                "params": [
                    {
                        "name": "Gain",
                        "index": 0,
                        "value": 0.5
                    },
                    {
                        "name": "Bass",
                        "index": 3,
                        "value": 0.4
                    },
                    {
                        "name": "Middle",
                        "index": 2,
                        "value": 0.4
                    },
                    {
                        "name": "Treble",
                        "index": 1,
                        "value": 0.4
                    },
                    {
                        "name": "Master",
                        "index": 4,
                        "value": 0.7
                    }
                ]
            },
            {
                "type": "amp",
                "dspId": "Bassman",
                "name": "Tweed Bass",
                "params": [
                    {
                        "name": "Gain",
                        "index": 0,
                        "value": 0.6
                    },
                    {
                        "name": "Bass",
                        "index": 3,
                        "value": 0.4
                    },
                    {
                        "name": "Middle",
                        "index": 2,
                        "value": 0.5
                    },
                    {
                        "name": "Treble",
                        "index": 1,
                        "value": 0.7
                    },
                    {
                        "name": "Master",
                        "index": 4,
                        "value": 0.7
                    }
                ]
            },
            {
                "type": "amp",
                "dspId": "AC Boost",
                "name": "AC Boost",
                "params": [
                    {
                        "name": "Gain",
                        "index": 0,
                        "value": null
                    },
                    {
                        "name": "Bass",
                        "index": 3,
                        "value": null
                    },
                    {
                        "name": "Middle",
                        "index": 2,
                        "value": null
                    },
                    {
                        "name": "Treble",
                        "index": 1,
                        "value": null
                    },
                    {
                        "name": "Master",
                        "index": 4,
                        "value": null
                    }
                ]
            },
            {
                "type": "amp",
                "dspId": "Checkmate",
                "name": "Checkmate",
                "params": [
                    {
                        "name": "Gain",
                        "index": 0,
                        "value": 0.7
                    },
                    {
                        "name": "Bass",
                        "index": 3,
                        "value": 0.5
                    },
                    {
                        "name": "Middle",
                        "index": 2,
                        "value": 0.4
                    },
                    {
                        "name": "Treble",
                        "index": 1,
                        "value": 0.5
                    },
                    {
                        "name": "Master",
                        "index": 4,
                        "value": 0.4
                    }
                ]
            },
            {
                "type": "amp",
                "dspId": "TwoStoneSP50",
                "name": "Two Stone SP50",
                "params": [
                    {
                        "name": "Gain",
                        "index": 0,
                        "value": 0.6
                    },
                    {
                        "name": "Bass",
                        "index": 3,
                        "value": 0.5
                    },
                    {
                        "name": "Middle",
                        "index": 2,
                        "value": 0.6
                    },
                    {
                        "name": "Treble",
                        "index": 1,
                        "value": 0.5
                    },
                    {
                        "name": "Master",
                        "index": 4,
                        "value": 0.7
                    }
                ]
            },
            {
                "type": "amp",
                "dspId": "Deluxe65",
                "name": "American Deluxe",
                "params": [
                    {
                        "name": "Gain",
                        "index": 0,
                        "value": 0.7
                    },
                    {
                        "name": "Bass",
                        "index": 3,
                        "value": 0.6
                    },
                    {
                        "name": "Middle",
                        "index": 2,
                        "value": 0.2
                    },
                    {
                        "name": "Treble",
                        "index": 1,
                        "value": 0.4
                    },
                    {
                        "name": "Master",
                        "index": 4,
                        "value": 0.7
                    }
                ]
            },
            {
                "type": "amp",
                "dspId": "Plexi",
                "name": "Plexiglas",
                "params": [
                    {
                        "name": "Gain",
                        "index": 0,
                        "value": 0.7
                    },
                    {
                        "name": "Bass",
                        "index": 3,
                        "value": 0.6
                    },
                    {
                        "name": "Middle",
                        "index": 2,
                        "value": 0.5
                    },
                    {
                        "name": "Treble",
                        "index": 1,
                        "value": 0.4
                    },
                    {
                        "name": "Master",
                        "index": 4,
                        "value": 0.3
                    }
                ]
            },
            {
                "type": "amp",
                "dspId": "OverDrivenJM45",
                "name": "JM45",
                "params": [
                    {
                        "name": "Gain",
                        "index": 0,
                        "value": 0.7
                    },
                    {
                        "name": "Bass",
                        "index": 3,
                        "value": 0.6
                    },
                    {
                        "name": "Middle",
                        "index": 2,
                        "value": 0.3
                    },
                    {
                        "name": "Treble",
                        "index": 1,
                        "value": 0.5
                    },
                    {
                        "name": "Master",
                        "index": 4,
                        "value": 0.7
                    }
                ]
            },
            {
                "type": "amp",
                "dspId": "OverDrivenLuxVerb",
                "name": "Lux Verb",
                "params": [
                    {
                        "name": "Gain",
                        "index": 0,
                        "value": 0.3
                    },
                    {
                        "name": "Bass",
                        "index": 3,
                        "value": 0.4
                    },
                    {
                        "name": "Middle",
                        "index": 2,
                        "value": 0.3
                    },
                    {
                        "name": "Treble",
                        "index": 1,
                        "value": 0.2
                    },
                    {
                        "name": "Master",
                        "index": 4,
                        "value": 0.8
                    }
                ]
            },
            {
                "type": "amp",
                "dspId": "Bogner",
                "name": "RB 101",
                "params": [
                    {
                        "name": "Gain",
                        "index": 0,
                        "value": 0.7
                    },
                    {
                        "name": "Bass",
                        "index": 3,
                        "value": 0.4
                    },
                    {
                        "name": "Middle",
                        "index": 2,
                        "value": 0.6
                    },
                    {
                        "name": "Treble",
                        "index": 1,
                        "value": 0.6
                    },
                    {
                        "name": "Master",
                        "index": 4,
                        "value": 0.5
                    }
                ]
            },
            {
                "type": "amp",
                "dspId": "OrangeAD30",
                "name": "British 30",
                "params": [
                    {
                        "name": "Gain",
                        "index": 0,
                        "value": 0.7
                    },
                    {
                        "name": "Bass",
                        "index": 3,
                        "value": 0.6
                    },
                    {
                        "name": "Middle",
                        "index": 2,
                        "value": 0.4
                    },
                    {
                        "name": "Treble",
                        "index": 1,
                        "value": 0.4
                    },
                    {
                        "name": "Master",
                        "index": 4,
                        "value": 0.3
                    }
                ]
            },
            {
                "type": "amp",
                "dspId": "AmericanHighGain",
                "name": "American High Gain",
                "params": [
                    {
                        "name": "Gain",
                        "index": 0,
                        "value": 0.6
                    },
                    {
                        "name": "Bass",
                        "index": 3,
                        "value": 0.5
                    },
                    {
                        "name": "Middle",
                        "index": 2,
                        "value": 0.6
                    },
                    {
                        "name": "Treble",
                        "index": 1,
                        "value": 0.4
                    },
                    {
                        "name": "Master",
                        "index": 4,
                        "value": 0.8
                    }
                ]
            },
            {
                "type": "amp",
                "dspId": "SLO100",
                "name": "Slo 100",
                "params": [
                    {
                        "name": "Gain",
                        "index": 0,
                        "value": 0.6
                    },
                    {
                        "name": "Bass",
                        "index": 3,
                        "value": 0.5
                    },
                    {
                        "name": "Middle",
                        "index": 2,
                        "value": 0.5
                    },
                    {
                        "name": "Treble",
                        "index": 1,
                        "value": 0.4
                    },
                    {
                        "name": "Master",
                        "index": 4,
                        "value": 0.5
                    }
                ]
            },
            {
                "type": "amp",
                "dspId": "YJM100",
                "name": "YJM100",
                "params": [
                    {
                        "name": "Gain",
                        "index": 0,
                        "value": 0.6
                    },
                    {
                        "name": "Bass",
                        "index": 3,
                        "value": 0.6
                    },
                    {
                        "name": "Middle",
                        "index": 2,
                        "value": 0.4
                    },
                    {
                        "name": "Treble",
                        "index": 1,
                        "value": 0.5
                    },
                    {
                        "name": "Master",
                        "index": 4,
                        "value": 0.6
                    }
                ]
            },
            {
                "type": "amp",
                "dspId": "Rectifier",
                "name": "Treadplate",
                "params": [
                    {
                        "name": "Gain",
                        "index": 0,
                        "value": 0.7
                    },
                    {
                        "name": "Bass",
                        "index": 3,
                        "value": 0.6
                    },
                    {
                        "name": "Middle",
                        "index": 2,
                        "value": 0.6
                    },
                    {
                        "name": "Treble",
                        "index": 1,
                        "value": 0.6
                    },
                    {
                        "name": "Master",
                        "index": 4,
                        "value": 0.8
                    }
                ]
            },
            {
                "type": "amp",
                "dspId": "EVH",
                "name": "Insane",
                "params": [
                    {
                        "name": "Gain",
                        "index": 0,
                        "value": 0.5
                    },
                    {
                        "name": "Bass",
                        "index": 3,
                        "value": 0.3
                    },
                    {
                        "name": "Middle",
                        "index": 2,
                        "value": 0.6
                    },
                    {
                        "name": "Treble",
                        "index": 1,
                        "value": 0.7
                    },
                    {
                        "name": "Master",
                        "index": 4,
                        "value": 0.9
                    }
                ]
            },
            {
                "type": "amp",
                "dspId": "SwitchAxeLead",
                "name": "SwitchAxe",
                "params": [
                    {
                        "name": "Gain",
                        "index": 0,
                        "value": 0.6
                    },
                    {
                        "name": "Bass",
                        "index": 3,
                        "value": 0.6
                    },
                    {
                        "name": "Middle",
                        "index": 2,
                        "value": 0.5
                    },
                    {
                        "name": "Treble",
                        "index": 1,
                        "value": 0.5
                    },
                    {
                        "name": "Master",
                        "index": 4,
                        "value": 0.7
                    }
                ]
            },
            {
                "type": "amp",
                "dspId": "Invader",
                "name": "Rocker V",
                "params": [
                    {
                        "name": "Gain",
                        "index": 0,
                        "value": 0.6
                    },
                    {
                        "name": "Bass",
                        "index": 3,
                        "value": 0.6
                    },
                    {
                        "name": "Middle",
                        "index": 2,
                        "value": 0.4
                    },
                    {
                        "name": "Treble",
                        "index": 1,
                        "value": 0.5
                    },
                    {
                        "name": "Master",
                        "index": 4,
                        "value": 0.6
                    }
                ]
            },
            {
                "type": "amp",
                "dspId": "BE101",
                "name": "BE 101",
                "params": [
                    {
                        "name": "Gain",
                        "index": 0,
                        "value": 0.6
                    },
                    {
                        "name": "Bass",
                        "index": 3,
                        "value": 0.4
                    },
                    {
                        "name": "Middle",
                        "index": 2,
                        "value": 0.6
                    },
                    {
                        "name": "Treble",
                        "index": 1,
                        "value": 0.6
                    },
                    {
                        "name": "Master",
                        "index": 4,
                        "value": 0.8
                    }
                ]
            },
            {
                "type": "amp",
                "dspId": "Acoustic",
                "name": "Pure Acoustic",
                "params": [
                    {
                        "name": "Gain",
                        "index": 0,
                        "value": 0.6
                    },
                    {
                        "name": "Bass",
                        "index": 3,
                        "value": 0.5
                    },
                    {
                        "name": "Middle",
                        "index": 2,
                        "value": 0.5
                    },
                    {
                        "name": "Treble",
                        "index": 1,
                        "value": 0.5
                    },
                    {
                        "name": "Master",
                        "index": 4,
                        "value": 0.5
                    }
                ]
            },
            {
                "type": "amp",
                "dspId": "AcousticAmpV2",
                "name": "Fishboy",
                "params": [
                    {
                        "name": "Gain",
                        "index": 0,
                        "value": 0.4
                    },
                    {
                        "name": "Bass",
                        "index": 3,
                        "value": 0.7
                    },
                    {
                        "name": "Middle",
                        "index": 2,
                        "value": 0.1
                    },
                    {
                        "name": "Treble",
                        "index": 1,
                        "value": 0.4
                    },
                    {
                        "name": "Master",
                        "index": 4,
                        "value": 0.8
                    }
                ]
            },
            {
                "type": "amp",
                "dspId": "FatAcousticV2",
                "name": "Jumbo",
                "params": [
                    {
                        "name": "Gain",
                        "index": 0,
                        "value": 0.5
                    },
                    {
                        "name": "Bass",
                        "index": 3,
                        "value": 0.7
                    },
                    {
                        "name": "Middle",
                        "index": 2,
                        "value": 0.5
                    },
                    {
                        "name": "Treble",
                        "index": 1,
                        "value": 0.5
                    },
                    {
                        "name": "Master",
                        "index": 4,
                        "value": 0.5
                    }
                ]
            },
            {
                "type": "amp",
                "dspId": "FlatAcoustic",
                "name": "Flat Acoustic",
                "params": [
                    {
                        "name": "Gain",
                        "index": 0,
                        "value": 0.7
                    },
                    {
                        "name": "Bass",
                        "index": 3,
                        "value": 0.7
                    },
                    {
                        "name": "Middle",
                        "index": 2,
                        "value": 0.6
                    },
                    {
                        "name": "Treble",
                        "index": 1,
                        "value": 0.4
                    },
                    {
                        "name": "Master",
                        "index": 4,
                        "value": 0.5
                    }
                ]
            },
            {
                "type": "amp",
                "dspId": "GK800",
                "name": "RB-800",
                "params": [
                    {
                        "name": "Gain",
                        "index": 0,
                        "value": 0.5
                    },
                    {
                        "name": "Bass",
                        "index": 3,
                        "value": 0.6
                    },
                    {
                        "name": "Middle",
                        "index": 2,
                        "value": 0.4
                    },
                    {
                        "name": "Treble",
                        "index": 1,
                        "value": 0.4
                    },
                    {
                        "name": "Master",
                        "index": 4,
                        "value": 0.9
                    }
                ]
            },
            {
                "type": "amp",
                "dspId": "Sunny3000",
                "name": "Sunny 3000",
                "params": [
                    {
                        "name": "Gain",
                        "index": 0,
                        "value": 0.5
                    },
                    {
                        "name": "Bass",
                        "index": 3,
                        "value": 0.5
                    },
                    {
                        "name": "Middle",
                        "index": 2,
                        "value": 0.4
                    },
                    {
                        "name": "Treble",
                        "index": 1,
                        "value": 0.6
                    },
                    {
                        "name": "Master",
                        "index": 4,
                        "value": 0.7
                    }
                ]
            },
            {
                "type": "amp",
                "dspId": "W600",
                "name": "W600",
                "params": [
                    {
                        "name": "Gain",
                        "index": 0,
                        "value": 0.5
                    },
                    {
                        "name": "Bass",
                        "index": 3,
                        "value": 0.6
                    },
                    {
                        "name": "Middle",
                        "index": 2,
                        "value": 0.3
                    },
                    {
                        "name": "Treble",
                        "index": 1,
                        "value": 0.4
                    },
                    {
                        "name": "Master",
                        "index": 4,
                        "value": 0.9
                    }
                ]
            },
            {
                "type": "amp",
                "dspId": "Hammer500",
                "name": "Hammer 500",
                "params": [
                    {
                        "name": "Gain",
                        "index": 0,
                        "value": 0.5
                    },
                    {
                        "name": "Bass",
                        "index": 3,
                        "value": 0.7
                    },
                    {
                        "name": "Middle",
                        "index": 2,
                        "value": 0.3
                    },
                    {
                        "name": "Treble",
                        "index": 1,
                        "value": 0.5
                    },
                    {
                        "name": "Master",
                        "index": 4,
                        "value": 0.8
                    }
                ]
            },
            {
                "type": "amp",
                "dspId": "JCM800",
                "isExperimental":true,
                "name": "JCM 800",
                "params": [
                    {
                        "name": "Gain",
                        "index": 0,
                        "value": 0.5
                    },
                    {
                        "name": "Bass",
                        "index": 3,
                        "value": 0.5
                    },
                    {
                        "name": "Middle",
                        "index": 2,
                        "value": 0.4
                    },
                    {
                        "name": "Treble",
                        "index": 1,
                        "value": 0.6
                    },
                    {
                        "name": "Master",
                        "index": 4,
                        "value": 0.7
                    }
                ]
            },
            {
                "type": "amp",
                "dspId": "MatchlessDC30",
                "isExperimental":true,
                "name": "Matchless DC30",
                "params": [
                    {
                        "name": "Gain",
                        "index": 0,
                        "value": 0.5
                    },
                    {
                        "name": "Bass",
                        "index": 3,
                        "value": 0.5
                    },
                    {
                        "name": "Middle",
                        "index": 2,
                        "value": 0.4
                    },
                    {
                        "name": "Treble",
                        "index": 1,
                        "value": 0.6
                    },
                    {
                        "name": "Master",
                        "index": 4,
                        "value": 0.7
                    }
                ]
            },
            {
                "type": "amp",
                "dspId": "DrZ",
                "name": "Dr. Z",
                "isExperimental":true,
                "params": [
                    {
                        "name": "Gain",
                        "index": 0,
                        "value": 0.5
                    },
                    {
                        "name": "Bass",
                        "index": 3,
                        "value": 0.5
                    },
                    {
                        "name": "Middle",
                        "index": 2,
                        "value": 0.4
                    },
                    {
                        "name": "Treble",
                        "index": 1,
                        "value": 0.6
                    },
                    {
                        "name": "Master",
                        "index": 4,
                        "value": 0.7
                    }
                ]
            },
            
            {
                "type": "amp",
                "dspId": "Hiwatt103",
                "name": "Hiwatt DR103",
                "isExperimental":true,
                "params": [
                    {
                        "name": "Gain",
                        "index": 0,
                        "value": 0.5
                    },
                    {
                        "name": "Bass",
                        "index": 3,
                        "value": 0.5
                    },
                    {
                        "name": "Middle",
                        "index": 2,
                        "value": 0.4
                    },
                    {
                        "name": "Treble",
                        "index": 1,
                        "value": 0.6
                    },
                    {
                        "name": "Master",
                        "index": 4,
                        "value": 0.7
                    }
                ]
            },
             
            {
                "type": "amp",
                "dspId": "B15",
                "name": "B-15",
                "isExperimental":true,
                "params": [
                    {
                        "name": "Gain",
                        "index": 0,
                        "value": 0.5
                    },
                    {
                        "name": "Bass",
                        "index": 3,
                        "value": 0.5
                    },
                    {
                        "name": "Middle",
                        "index": 2,
                        "value": 0.4
                    },
                    {
                        "name": "Treble",
                        "index": 1,
                        "value": 0.6
                    },
                    {
                        "name": "Master",
                        "index": 4,
                        "value": 0.7
                    }
                ]
            },
            {
                "type": "amp",
                "dspId": "Acoustic360",
                "name": "Acoustic 360",
                "isExperimental":true,
                "params": [
                    {
                        "name": "Gain",
                        "index": 0,
                        "value": 0.5
                    },
                    {
                        "name": "Bass",
                        "index": 3,
                        "value": 0.5
                    },
                    {
                        "name": "Middle",
                        "index": 2,
                        "value": 0.4
                    },
                    {
                        "name": "Treble",
                        "index": 1,
                        "value": 0.6
                    },
                    {
                        "name": "Master",
                        "index": 4,
                        "value": 0.7
                    }
                ]
            },
            {
                "type": "amp",
                "dspId": "GK700RBII",
                "name": "GK 700 RB II",
                "isExperimental":true,
                "params": [
                    {
                        "name": "Gain",
                        "index": 0,
                        "value": 0.5
                    },
                    {
                        "name": "Bass",
                        "index": 3,
                        "value": 0.5
                    },
                    {
                        "name": "Middle",
                        "index": 2,
                        "value": 0.4
                    },
                    {
                        "name": "Treble",
                        "index": 1,
                        "value": 0.6
                    },
                    {
                        "name": "Master",
                        "index": 4,
                        "value": 0.7
                    }
                ]
            },
            
            {
                "type": "comp",
                "dspId": "LA2AComp",
                "name": "LA Comp",
                "params": [
                    {
                        "name": "Gain",
                        "index": 1,
                        "value": 0.7
                    },
                    {
                        "name": "Peak Reduction",
                        "index": 2,
                        "value": 0.7
                    },
                    {
                        "name": "Limit/Compress",
                        "index": 0,
                        "value": 0
                    }
                ]
            },
            {
                "type": "comp",
                "dspId": "BlueComp",
                "name": "Sustainer",
                "params": [
                    {
                        "name": "Level",
                        "index": 0,
                        "value": 0.5
                    },
                    {
                        "name": "Tone",
                        "index": 1,
                        "value": 0.5
                    },
                    {
                        "name": "Attack",
                        "index": 2,
                        "value": 0.5
                    },
                    {
                        "name": "Sustain",
                        "index": 3,
                        "value": 0.6
                    }
                ]
            },
            {
                "type": "comp",
                "dspId": "Compressor",
                "name": "Red Comp",
                "params": [
                    {
                        "name": "Output",
                        "index": 0,
                        "value": 0.4
                    },
                    {
                        "name": "Sensitivity",
                        "index": 1,
                        "value": 0.6
                    }
                ]
            },
            {
                "type": "comp",
                "dspId": "BassComp",
                "name": "Bass Comp",
                "params": [
                    {
                        "name": "Comp",
                        "index": 0,
                        "value": 0.4
                    },
                    {
                        "name": "Gain",
                        "index": 1,
                        "value": 0.5
                    }
                ]
            },
            {
                "type": "comp",
                "dspId": "BBEOpticalComp",
                "name": "Optical Comp",
                "params": [
                    {
                        "name": "Volume",
                        "index": 0,
                        "value": 0.7
                    },
                    {
                        "name": "Comp",
                        "index": 1,
                        "value": 0.4
                    },
                    {
                        "name": "Pad",
                        "index": 2,
                        "value": 0
                    }
                ]
            },
            {
                "type": "delay",
                "dspId": "DelayMono",
                "name": "Digital Delay",
                "params": [
                    {
                        "name": "E.Level",
                        "index": 0,
                        "value": 0.4
                    },
                    {
                        "name": "F.Back",
                        "index": 1,
                        "value": 0.4
                    },
                    {
                        "name": "D.Time",
                        "index": 2,
                        "value": 0.7
                    },
                    {
                        "name": "Mode",
                        "index": 3,
                        "value": 0.6
                    },
                    {
                        "name": "BPM",
                        "index": 4,
                        "value": 0
                    }
                ]
            },
            {
                "type": "delay",
                "dspId": "DelayEchoFilt",
                "name": "Delay/Echo",
                "params": [
                    {
                        "name": "Delay",
                        "index": 0,
                        "value": 0.2
                    },
                    {
                        "name": "Feedback",
                        "index": 1,
                        "value": 0.5
                    },
                    {
                        "name": "Level",
                        "index": 2,
                        "value": 0.7
                    },
                    {
                        "name": "Tone",
                        "index": 3,
                        "value": 0.5
                    },
                    {
                        "name": "BPM",
                        "index": 4,
                        "value": 0
                    }
                ]
            },
            {
                "type": "delay",
                "dspId": "VintageDelay",
                "name": "Vintage Delay",
                "params": [
                    {
                        "name": "Repeat Rate",
                        "index": 0,
                        "value": 0.3
                    },
                    {
                        "name": "Intensity",
                        "index": 1,
                        "value": 0.6
                    },
                    {
                        "name": "Echo",
                        "index": 2,
                        "value": 0.7
                    },
                    {
                        "name": "BPM",
                        "index": 3,
                        "value": 1
                    }
                ]
            },
            {
                "type": "delay",
                "dspId": "DelayReverse",
                "name": "Reverse Delay",
                "params": [
                    {
                        "name": "Mix",
                        "index": 0,
                        "value": 0.7
                    },
                    {
                        "name": "Decay",
                        "index": 1,
                        "value": 0.4
                    },
                    {
                        "name": "Filter",
                        "index": 2,
                        "value": 0.7
                    },
                    {
                        "name": "Time",
                        "index": 3,
                        "value": 0.6
                    },
                    {
                        "name": "BPM",
                        "index": 4,
                        "value": 0
                    }
                ]
            },
            {
                "type": "delay",
                "dspId": "DelayMultiHead",
                "name": "Multi Head",
                "params": [
                    {
                        "name": "Repeat Rate",
                        "index": 0,
                        "value": 0.6
                    },
                    {
                        "name": "Intensity",
                        "index": 1,
                        "value": 0.6
                    },
                    {
                        "name": "Echo Vol",
                        "index": 2,
                        "value": 0.5
                    },
                    {
                        "name": "Mode Selector",
                        "index": 3,
                        "value": 0.6
                    },
                    {
                        "name": "BPM",
                        "index": 4,
                        "value": 0
                    }
                ]
            },
            {
                "type": "delay",
                "dspId": "DelayRe201",
                "name": "Echo Tape",
                "params": [
                    {
                        "name": "Sustain",
                        "index": 0,
                        "value": 0.7
                    },
                    {
                        "name": "Volume",
                        "index": 1,
                        "value": 0.6
                    },
                    {
                        "name": "Tone",
                        "index": 2,
                        "value": 0.8
                    },
                    {
                        "name": "Short -> Long",
                        "index": 3,
                        "value": 0.4
                    },
                    {
                        "name": "BPM",
                        "index": 4,
                        "value": 1
                    }
                ]
            },
            {
                "type": "drive",
                "dspId": "Booster",
                "name": "Booster",
                "params": [
                    {
                        "name": "Gain",
                        "index": 0,
                        "value": 0.8
                    }
                ]
            },
            {
                "type": "drive",
                "dspId": "DistortionTS9",
                "name": "Tube Drive",
                "params": [
                    {
                        "name": "Overdrive",
                        "index": 0,
                        "value": 0.6
                    },
                    {
                        "name": "Tone",
                        "index": 1,
                        "value": 0.5
                    },
                    {
                        "name": "Level",
                        "index": 2,
                        "value": 0.6
                    }
                ]
            },
            {
                "type": "drive",
                "dspId": "Overdrive",
                "name": "Over Drive",
                "params": [
                    {
                        "name": "Level",
                        "index": 0,
                        "value": 0.6
                    },
                    {
                        "name": "Tone",
                        "index": 1,
                        "value": 0.7
                    },
                    {
                        "name": "Drive",
                        "index": 2,
                        "value": 0.5
                    }
                ]
            },
            {
                "type": "drive",
                "dspId": "Fuzz",
                "name": "Fuzz Face",
                "params": [
                    {
                        "name": "Volume",
                        "index": 0,
                        "value": 0.4
                    },
                    {
                        "name": "Fuzz",
                        "index": 1,
                        "value": 0.8
                    }
                ]
            },
            {
                "type": "drive",
                "dspId": "ProCoRat",
                "name": "Black Op",
                "params": [
                    {
                        "name": "Distortion",
                        "index": 0,
                        "value": 0.7
                    },
                    {
                        "name": "Filter",
                        "index": 1,
                        "value": 0.5
                    },
                    {
                        "name": "Volume",
                        "index": 2,
                        "value": 0.7
                    }
                ]
            },
            {
                "type": "drive",
                "dspId": "BassBigMuff",
                "name": "Bass Muff",
                "params": [
                    {
                        "name": "Sustain",
                        "index": 2,
                        "value": 0.9
                    },
                    {
                        "name": "Tone",
                        "index": 1,
                        "value": 0.8
                    },
                    {
                        "name": "Volume",
                        "index": 0,
                        "value": 0.3
                    }
                ]
            },
            {
                "type": "drive",
                "dspId": "GuitarMuff",
                "name": "Guitar Muff",
                "params": [
                    {
                        "name": "Volume",
                        "index": 0,
                        "value": 0.5
                    },
                    {
                        "name": "Tone",
                        "index": 1,
                        "value": 0.5
                    },
                    {
                        "name": "Sustain",
                        "index": 2,
                        "value": 0.8
                    }
                ]
            },
            {
                "type": "drive",
                "dspId": "MaestroBassmaster",
                "name": "Bassmaster",
                "params": [
                    {
                        "name": "Brass Vol",
                        "index": 0,
                        "value": 0.4
                    },
                    {
                        "name": "Sensitivity",
                        "index": 1,
                        "value": 0.8
                    },
                    {
                        "name": "Bass Vol",
                        "index": 2,
                        "value": 0.2
                    }
                ]
            },
            {
                "type": "drive",
                "dspId": "SABdriver",
                "name": "SAB Driver",
                "params": [
                    {
                        "name": "Volume",
                        "index": 0,
                        "value": 0.4
                    },
                    {
                        "name": "Tone",
                        "index": 1,
                        "value": 0.5
                    },
                    {
                        "name": "Drive",
                        "index": 2,
                        "value": 0.8
                    },
                    {
                        "name": "HP/LP",
                        "index": 3,
                        "value": 0
                    }
                ]
            },
            {
                "type": "drive",
                "dspId": "MetalZoneMT2",
                "isExperimental":true,
                "name": "Metal Zone MT2",
                "params": [
                    {
                        "name": "Level",
                        "index": 0,
                        "value": 0.8
                    },
                    {
                        "name": "EQ Low",
                        "index": 1,
                        "value": 0.6
                    },
                    {
                        "name": "EQ Middle",
                        "index": 2,
                        "value": 0.19
                    },
                    {
                        "name": "EQ High",
                        "index": 3,
                        "value": 0.37
                    },
                    {
                        "name": "EQ Mid Band",
                        "index": 4,
                        "value": 0.59
                    },
                    {
                        "name": "Distortion",
                        "index": 5,
                        "value": 0.74
                    }
                ]
            },
            {
                "type": "drive",
                "dspId": "TrebleBooster",
                "isExperimental":true,
                "name": "Treble Booster",
                "params": [
                    {
                        "name": "P1",
                        "index": 2,
                        "value": 0.9
                    },
                    {
                        "name": "P2",
                        "index": 1,
                        "value": 0.8
                    },
                    {
                        "name": "P3",
                        "index": 0,
                        "value": 0.3
                    }
                ]
            },
            {
                "type": "gate",
                "dspId": "bias.noisegate",
                "name": "Gate",
                "params": [
                    {
                        "name": "Threshold",
                        "index": 0,
                        "value": 0.2
                    },
                    {
                        "name": "Decay",
                        "index": 1,
                        "value": 0.1
                    }
                ]
            },
            {
                "type": "modulation",
                "dspId": "Tremolo",
                "name": "Tremolo",
                "params": [
                    {
                        "name": "Speed",
                        "index": 0,
                        "value": 0.5
                    },
                    {
                        "name": "Depth",
                        "index": 1,
                        "value": 0.7
                    },
                    {
                        "name": "Level",
                        "index": 2,
                        "value": 0.6
                    }
                ]
            },
            {
                "type": "modulation",
                "dspId": "ChorusAnalog",
                "name": "Digital Chorus",
                "params": [
                    {
                        "name": "E.Level",
                        "index": 0,
                        "value": 0.8
                    },
                    {
                        "name": "Rate",
                        "index": 1,
                        "value": 0.3
                    },
                    {
                        "name": "Depth",
                        "index": 2,
                        "value": 0.7
                    },
                    {
                        "name": "Tone",
                        "index": 3,
                        "value": 0.6
                    }
                ]
            },
            {
                "type": "modulation",
                "dspId": "Flanger",
                "name": "Flanger",
                "params": [
                    {
                        "name": "Rate",
                        "index": 0,
                        "value": 0.4
                    },
                    {
                        "name": "Mix",
                        "index": 1,
                        "value": 0.7
                    },
                    {
                        "name": "Depth",
                        "index": 2,
                        "value": 0.7
                    }
                ]
            },
            {
                "type": "modulation",
                "dspId": "Phaser",
                "name": "Phaser",
                "params": [
                    {
                        "name": "Intensity",
                        "index": 1,
                        "value": 0.6
                    },
                    {
                        "name": "Speed",
                        "index": 0,
                        "value": 0.6
                    }
                ]
            },
            {
                "type": "modulation",
                "dspId": "Vibrato01",
                "name": "Vibrato",
                "params": [
                    {
                        "name": "Speed",
                        "index": 0,
                        "value": 0.8
                    },
                    {
                        "name": "Depth",
                        "index": 1,
                        "value": 0.5
                    }
                ]
            },
            {
                "type": "modulation",
                "dspId": "UniVibe",
                "name": "Vibe",
                "params": [
                    {
                        "name": "Speed",
                        "index": 0,
                        "value": 0.5
                    },
                    {
                        "name": "Intensity",
                        "index": 2,
                        "value": 0.7
                    },
                    {
                        "name": "Chorus / Vibrato",
                        "index": 1,
                        "value": 1
                    }
                ]
            },
            {
                "type": "modulation",
                "dspId": "Cloner",
                "name": "Cloner Chorus",
                "params": [
                    {
                        "name": "Rate",
                        "index": 0,
                        "value": 0.2
                    },
                    {
                        "name": "Depth (High / Low)",
                        "index": 1,
                        "value": 1
                    }
                ]
            },
            {
                "type": "modulation",
                "dspId": "MiniVibe",
                "name": "Mini Vibe",
                "params": [
                    {
                        "name": "Speed",
                        "index": 0,
                        "value": 0.3
                    },
                    {
                        "name": "Intensity",
                        "index": 1,
                        "value": 0.3
                    }
                ]
            },
            {
                "type": "modulation",
                "dspId": "Tremolator",
                "name": "Tremolator",
                "params": [
                    {
                        "name": "Depth",
                        "index": 0,
                        "value": 0.7
                    },
                    {
                        "name": "Speed",
                        "index": 1,
                        "value": 0.5
                    },
                    {
                        "name": "BPM",
                        "index": 2,
                        "value": 0
                    }
                ]
            },
            {
                "type": "modulation",
                "dspId": "TremoloSquare",
                "name": "Tremolo Square",
                "params": [
                    {
                        "name": "Speed",
                        "index": 0,
                        "value": 0.5
                    },
                    {
                        "name": "Depth",
                        "index": 1,
                        "value": 0.7
                    },
                    {
                        "name": "Level",
                        "index": 2,
                        "value": 0.6
                    }
                ]
            },
          
            {
                "type": "modulation",
                "dspId": "MuTron",
                "isExperimental":true,
                "name": "MuTron III",
                "params": [
                    {
                        "name": "Mode",
                        "index": 0,
                        "value": 0.3
                    },
                    {
                        "name": "Peak",
                        "index": 1,
                        "value": 0.2
                    },
                    {
                        "name": "Depth",
                        "index": 2,
                        "value": 0.9
                    },
                    {
                        "name": "Range",
                        "index": 3,
                        "value": 0
                    },
                    {
                        "name": "Position",
                        "index": 4,
                        "value": 0
                    }
                ]
            },
            {
                "type": "reverb",
                "dspId": "bias.reverb.0",
                "name": "Room Studio A",
                "params": [
                    {
                        "name": "Level",
                        "index": 0,
                        "value": null
                    },
                    {
                        "name": "Damping",
                        "index": 1,
                        "value": null
                    },
                    {
                        "name": "Low Cut",
                        "index": 2,
                        "value": null
                    },
                    {
                        "name": "High Cut",
                        "index": 3,
                        "value": null
                    },
                    {
                        "name": "Dwell",
                        "index": 4,
                        "value": null
                    },
                    {
                        "name": "Time",
                        "index": 5,
                        "value": null
                    }
                ]
            }, {
                "type": "reverb",
                "dspId": "bias.reverb.1",
                "name": "Room Studio B",
                "params": [
                    {
                        "name": "Level",
                        "index": 0,
                        "value": null
                    },
                    {
                        "name": "Damping",
                        "index": 1,
                        "value": null
                    },
                    {
                        "name": "Low Cut",
                        "index": 2,
                        "value": null
                    },
                    {
                        "name": "High Cut",
                        "index": 3,
                        "value": null
                    },
                    {
                        "name": "Dwell",
                        "index": 4,
                        "value": null
                    },
                    {
                        "name": "Time",
                        "index": 5,
                        "value": null
                    }
                ]
            },
            {
                "type": "reverb",
                "dspId": "bias.reverb.2",
                "name": "Chamber",
                "params": [
                    {
                        "name": "Level",
                        "index": 0,
                        "value": null
                    },
                    {
                        "name": "Damping",
                        "index": 1,
                        "value": null
                    },
                    {
                        "name": "Low Cut",
                        "index": 2,
                        "value": null
                    },
                    {
                        "name": "High Cut",
                        "index": 3,
                        "value": null
                    },
                    {
                        "name": "Dwell",
                        "index": 4,
                        "value": null
                    },
                    {
                        "name": "Time",
                        "index": 5,
                        "value": null
                    }
                ]
            },
            {
                "type": "reverb",
                "dspId": "bias.reverb.3",
                "name": "Hall Natural",
                "params": [
                    {
                        "name": "Level",
                        "index": 0,
                        "value": null
                    },
                    {
                        "name": "Damping",
                        "index": 1,
                        "value": null
                    },
                    {
                        "name": "Low Cut",
                        "index": 2,
                        "value": null
                    },
                    {
                        "name": "High Cut",
                        "index": 3,
                        "value": null
                    },
                    {
                        "name": "Dwell",
                        "index": 4,
                        "value": null
                    },
                    {
                        "name": "Time",
                        "index": 5,
                        "value": null
                    }
                ]
            },
            {
                "type": "reverb",
                "dspId": "bias.reverb.4",
                "name": "Hall Medium",
                "params": [
                    {
                        "name": "Level",
                        "index": 0,
                        "value": null
                    },
                    {
                        "name": "Damping",
                        "index": 1,
                        "value": null
                    },
                    {
                        "name": "Low Cut",
                        "index": 2,
                        "value": null
                    },
                    {
                        "name": "High Cut",
                        "index": 3,
                        "value": null
                    },
                    {
                        "name": "Dwell",
                        "index": 4,
                        "value": null
                    },
                    {
                        "name": "Time",
                        "index": 5,
                        "value": null
                    }
                ]
            },
            {
                "type": "reverb",
                "dspId": "bias.reverb.5",
                "name": "Hall Ambient",
                "params": [
                    {
                        "name": "Level",
                        "index": 0,
                        "value": null
                    },
                    {
                        "name": "Damping",
                        "index": 1,
                        "value": null
                    },
                    {
                        "name": "Low Cut",
                        "index": 2,
                        "value": null
                    },
                    {
                        "name": "High Cut",
                        "index": 3,
                        "value": null
                    },
                    {
                        "name": "Dwell",
                        "index": 4,
                        "value": null
                    },
                    {
                        "name": "Time",
                        "index": 5,
                        "value": null
                    }
                ]
            },
            {
                "type": "reverb",
                "dspId": "bias.reverb.6",
                "name": "Plate Short",
                "params": [
                    {
                        "name": "Level",
                        "index": 0,
                        "value": null
                    },
                    {
                        "name": "Damping",
                        "index": 1,
                        "value": null
                    },
                    {
                        "name": "Low Cut",
                        "index": 2,
                        "value": null
                    },
                    {
                        "name": "High Cut",
                        "index": 3,
                        "value": null
                    },
                    {
                        "name": "Dwell",
                        "index": 4,
                        "value": null
                    },
                    {
                        "name": "Time",
                        "index": 5,
                        "value": null
                    }
                ]
            },

            {
                "type": "reverb",
                "dspId": "bias.reverb.7",
                "name": "Plate Rich",
                "params": [
                    {
                        "name": "Level",
                        "index": 0,
                        "value": null
                    },
                    {
                        "name": "Damping",
                        "index": 1,
                        "value": null
                    },
                    {
                        "name": "Low Cut",
                        "index": 2,
                        "value": null
                    },
                    {
                        "name": "High Cut",
                        "index": 3,
                        "value": null
                    },
                    {
                        "name": "Dwell",
                        "index": 4,
                        "value": null
                    },
                    {
                        "name": "Time",
                        "index": 5,
                        "value": null
                    }
                ]
            },

            {
                "type": "reverb",
                "dspId": "bias.reverb.8",
                "name": "Plate Long",
                "params": [
                    {
                        "name": "Level",
                        "index": 0,
                        "value": null
                    },
                    {
                        "name": "Damping",
                        "index": 1,
                        "value": null
                    },
                    {
                        "name": "Low Cut",
                        "index": 2,
                        "value": null
                    },
                    {
                        "name": "High Cut",
                        "index": 3,
                        "value": null
                    },
                    {
                        "name": "Dwell",
                        "index": 4,
                        "value": null
                    },
                    {
                        "name": "Time",
                        "index": 5,
                        "value": null
                    }
                ]
            }
        ]
 
 
 
    };
}