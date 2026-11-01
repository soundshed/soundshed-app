import { useEffect } from "react";

// Keeps the screen awake while `active`. We use it while the amp is connected: when a
// Mac sleeps, macOS can keep the amp's Bluetooth link but tell the browser it
// disconnected, and the amp then stays unreachable until the page is reloaded.
export function useWakeLock(active: boolean) {
    useEffect(() => {
        if (!active || !("wakeLock" in navigator)) return;

        let lock: WakeLockSentinel | null = null;
        let stopped = false;

        const acquire = () => {
            if (stopped || document.visibilityState !== "visible" || (lock && !lock.released)) return;
            navigator.wakeLock.request("screen").then(
                (l) => { if (stopped) l.release(); else lock = l; },
                () => { /* not allowed right now, e.g. in battery saver mode */ });
        };

        acquire();
        // The browser releases the lock whenever the tab is hidden.
        document.addEventListener("visibilitychange", acquire);

        return () => {
            stopped = true;
            document.removeEventListener("visibilitychange", acquire);
            lock?.release().catch(() => { });
        };
    }, [active]);
}
