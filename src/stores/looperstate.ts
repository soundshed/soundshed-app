import { Store } from "pullstate";
import { LooperSettings, LooperStatus } from "../spork/src/devices/spark/sparkLooper";

export interface ILooperState {
    // a one bar count-in was started and recording begins when it ends
    isCountingIn: boolean;
    isRecording: boolean;
    isPlaying: boolean;
    // the amp holds a recorded loop (Ignitron's isRecAvailable)
    hasLoop: boolean;
    canRedo: boolean;
    loopCount: number;
    // position in the loop, 0..1, as last reported by the amp (0x03 0x77)
    measure: number | null;
    lastCommand: number | null;
    settings: LooperSettings | null;
    status: LooperStatus | null;
    // global tempo the amp reported through the existing 0x03 0x63 BPM message
    ampBpm: number | null;
    lastError: string | null;
}

export const initialLooperState = (): ILooperState => ({
    isCountingIn: false,
    isRecording: false,
    isPlaying: false,
    hasLoop: false,
    canRedo: false,
    loopCount: 0,
    measure: null,
    lastCommand: null,
    settings: null,
    status: null,
    ampBpm: null,
    lastError: null,
});

export const LooperStateStore = new Store<ILooperState>(initialLooperState());
