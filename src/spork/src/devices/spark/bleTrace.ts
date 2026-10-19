// Ring-buffer tracer for the BLE transport.
//
// A dropped GATT link is impossible to diagnose after the fact: by the time the UI
// shows "reconnecting", the interesting part (what was on the wire immediately
// before the drop) is gone. This keeps a bounded, timestamped history and dumps it
// when the link goes down.
//
// Enable with localStorage.setItem("_bleTrace", "1"), then reproduce. The trace is
// printed on disconnect and is also readable at any time via window.__sparkTrace().

export interface BleTraceEntry {
    at: number;
    kind: "write" | "recv" | "event" | "error";
    detail: string;
}

const MAX_ENTRIES = 400;

export class BleTrace {
    private entries: BleTraceEntry[] = [];
    private startedAt = Date.now();

    public isEnabled(): boolean {
        try {
            return typeof localStorage !== "undefined" && localStorage.getItem("_bleTrace") === "1";
        } catch {
            return false;
        }
    }

    public record(kind: BleTraceEntry["kind"], detail: string) {
        if (!this.isEnabled()) return;

        this.entries.push({ at: Date.now() - this.startedAt, kind, detail });
        if (this.entries.length > MAX_ENTRIES) {
            this.entries.shift();
        }
    }

    public getEntries(): BleTraceEntry[] {
        return [...this.entries];
    }

    /** Human-readable trace, newest last, with the gap between entries in ms. */
    public format(): string {
        const lines: string[] = [];
        let previous = 0;

        for (const entry of this.entries) {
            const gap = entry.at - previous;
            previous = entry.at;
            lines.push(
                `+${String(entry.at).padStart(7)}ms (${String(gap).padStart(5)}ms) ${entry.kind.padEnd(5)} ${entry.detail}`
            );
        }

        return lines.join("\n");
    }

    public dump(reason: string) {
        if (!this.isEnabled()) return;

        console.error(
            `[Spark BLE trace] ${reason}\n` +
            `Last ${this.entries.length} transport events:\n` +
            this.format()
        );
    }
}

export const bleTrace = new BleTrace();

// Expose for manual inspection from the devtools console.
if (typeof window !== "undefined") {
    (window as any).__sparkTrace = () => bleTrace.format();
}
