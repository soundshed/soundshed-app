import { Store } from "pullstate";

export interface ITunerState {
    /** Whether the amp's tuner is on, as far as we know (from our own toggles or the amp's). */
    isEnabled: boolean;
    /** A toggle request from the app is in flight. */
    isPending: boolean;
    /** Raw note byte of the latest reading, or null when there is no reading. */
    note: number | null;
    /** Raw offset float of the latest reading, or null when there is no reading. */
    offset: number | null;
    /** Date.now() of the latest reading, 0 when there has been none. */
    lastReadingAt: number;
    /** Why the last switch request from the app failed, or null. */
    error: string | null;
}

export const initialTunerState = (): ITunerState => ({
    isEnabled: false,
    isPending: false,
    note: null,
    offset: null,
    lastReadingAt: 0,
    error: null
});

export const TunerStateStore = new Store<ITunerState>(initialTunerState());
