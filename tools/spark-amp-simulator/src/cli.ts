import { getModelProfile, SPARK_MODEL_PROFILES } from "./models";
import { SparkAmpSimulator } from "./simulator";
import { SparkAmpSimulatorServer } from "./server";
import { SparkAmpBlePeripheral } from "./blePeripheral";
import logUpdate from "log-update";

type SimulatorTransport = "tcp" | "ble" | "both";

interface CliOptions {
    model: string;
    host: string;
    port: number;
    verbose: boolean;
    transport: SimulatorTransport;
    tui: boolean;
}

interface TuiController {
    pushLog: (msg: string) => void;
    stop: () => void;
}

function isTransportToken(value: string): value is SimulatorTransport {
    const normalized = value.toLowerCase();
    return normalized === "tcp" || normalized === "ble" || normalized === "both";
}

function tryParsePort(value: string): number | null {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) {
        return null;
    }

    return parsed;
}

function printHelp() {
    const models = Object.keys(SPARK_MODEL_PROFILES).join(", ");
    console.log("Spark Amp Simulator");
    console.log("");
    console.log("Usage:");
    console.log("  node cli.js [--model <id>] [--port <n>] [--host <addr>] [--transport tcp|ble|both] [--verbose] [--no-tui]");
    console.log("  node cli.js --models");
    console.log("  node cli.js --help");
    console.log("");
    console.log("Positional shorthand:");
    console.log("  node cli.js <model> [port] [host]");
    console.log("  node cli.js <model> <transport> <host> <port>");
    console.log("");
    console.log(`Models: ${models}`);
}

function formatCmd(value: number | null): string {
    if (value == null) {
        return "n/a";
    }

    return `0x${value.toString(16).padStart(2, "0")}`;
}

function createTui(
    simulator: SparkAmpSimulator,
    server: SparkAmpSimulatorServer | null,
    profileName: string,
    transport: SimulatorTransport
): TuiController {
    const logs: string[] = [];
    const maxLogs = 12;
    let timer: ReturnType<typeof setInterval> | null = null;

    const pushLog = (msg: string) => {
        const timestamp = new Date().toLocaleTimeString();
        logs.push(`${timestamp} ${msg}`);
        if (logs.length > maxLogs) {
            logs.shift();
        }
    };

    const makeBox = (title: string, body: string[], width: number): string[] => {
        const innerWidth = Math.max(30, width - 2);
        const top = `+${"-".repeat(innerWidth)}+`;
        const titleText = ` ${title} `;
        const titleLine = `|${titleText.padEnd(innerWidth, " ")}|`;
        const rows = body.map((line) => `|${line.slice(0, innerWidth).padEnd(innerWidth, " ")}|`);
        return [top, titleLine, top, ...rows, top];
    };

    const fmt = (label: string, value: string): string => `${label.padEnd(18, " ")}: ${value}`;

    const renderChainColumns = (preset: ReturnType<SparkAmpSimulator["getStateSnapshot"]>["currentPreset"], width: number): string[] => {
        if (!preset.chainSlots || preset.chainSlots.length === 0) {
            return ["(no chain slot data)"];
        }

        const minColWidth = 22;
        const spacing = 2;
        const columnCount = Math.max(1, Math.floor((width + spacing) / (minColWidth + spacing)));
        const colWidth = Math.max(minColWidth, Math.floor((width - (columnCount - 1) * spacing) / columnCount));
        const rows: string[] = [];

        for (let start = 0; start < preset.chainSlots.length; start += columnCount) {
            const group = preset.chainSlots.slice(start, start + columnCount);
            const colLines = group.map((slot) => {
                const values = slot.active
                    ? (slot.paramValues.length > 0
                        ? slot.paramValues.map((v) => v.toFixed(2)).join(", ")
                        : "(none)")
                    : "(inactive)";

                return [
                    `S${slot.index + 1} ${slot.active ? "ACTIVE" : "off"}`,
                    slot.dspId,
                    `params: ${values}`
                ];
            });

            const maxLines = Math.max(...colLines.map((l) => l.length));
            for (let lineIdx = 0; lineIdx < maxLines; lineIdx++) {
                const parts = colLines.map((linesForCol) => {
                    const content = linesForCol[lineIdx] ?? "";
                    return content.slice(0, colWidth).padEnd(colWidth, " ");
                });
                rows.push(parts.join(" ".repeat(spacing)));
            }

            rows.push("");
        }

        if (rows.length > 0 && rows[rows.length - 1] === "") {
            rows.pop();
        }

        return rows;
    };

    const render = () => {
        const state = simulator.getStateSnapshot();
        const serverStats = server?.getStats();
        const width = Math.max(80, Math.min(120, (process.stdout.columns || 100) - 2));

        const headerBody = [
            fmt("Model", profileName),
            fmt("Transport", transport),
            fmt("Serial", state.serial),
            fmt("Selected Slot", String(state.selectedSlot)),
            fmt("Stored Presets", String(state.storedPresets)),
            fmt("Pending Upload", state.pendingUpload),
            fmt("Upload Complete", String(state.uploadCompleted)),
            fmt("Last Command", `${formatCmd(state.lastCmd)} / ${formatCmd(state.lastSubCmd)}`),
            fmt("Response Count", String(state.lastResponses))
        ];

        const lines: string[] = [];
        lines.push(...makeBox("Spark Amp Simulator", headerBody, width));
        lines.push("");

        const preset = state.currentPreset;
        const presetBody = [
            fmt("Slot", String(preset.slot)),
            fmt("Name", preset.name),
            fmt("UUID", preset.uuid || "n/a"),
            fmt("BPM", Number.isFinite(preset.bpm) ? preset.bpm.toFixed(1) : "n/a"),
            fmt("FX", `${preset.activeFxCount}/${preset.fxCount} active`),
            fmt("Chain", preset.fxNames.length > 0 ? preset.fxNames.join(" -> ") : "n/a")
        ];
        lines.push(...makeBox("Current Channel Preset", presetBody, width));
        lines.push("");

        const chainColumnBody = renderChainColumns(preset, width - 2);
        lines.push(...makeBox("Chain Slots (Active Param Values)", chainColumnBody, width));
        lines.push("");

        if (serverStats) {
            const serverBody = [
                fmt("Endpoint", `${serverStats.host}:${serverStats.port}`),
                fmt("Connected Clients", String(serverStats.connectedClients)),
                fmt("RX Frames", String(serverStats.rxFrames)),
                fmt("TX Frames", String(serverStats.txFrames))
            ];
            lines.push(...makeBox("TCP Server", serverBody, width));
            lines.push("");
        }

        const logBody = logs.length === 0
            ? ["(no logs yet)"]
            : logs.map((item) => item);
        lines.push(...makeBox("Recent Logs", logBody, width));
        lines.push("");
        lines.push("Press Ctrl+C to stop.");

        logUpdate(lines.join("\n") + "\n");
    };

    timer = setInterval(render, 250);
    render();

    const stop = () => {
        if (timer) {
            clearInterval(timer);
            timer = null;
        }

        logUpdate.clear();
        logUpdate.done();
    };

    return { pushLog, stop };
}

function readNpmForwardedArgs(): string[] {
    const raw = process.env.npm_config_argv;
    if (!raw) {
        return [];
    }

    try {
        const parsed = JSON.parse(raw) as { original?: string[] };
        const original = parsed.original ?? [];
        const separatorIndex = original.indexOf("--");
        if (separatorIndex >= 0) {
            return original.slice(separatorIndex + 1);
        }
    } catch {
        return [];
    }

    return [];
}

function readNpmConfigArgs(): string[] {
    const args: string[] = [];

    if (process.env.npm_config_models === "true") {
        args.push("--models");
    }

    if (process.env.npm_config_model) {
        args.push("--model", process.env.npm_config_model);
    }

    if (process.env.npm_config_host) {
        args.push("--host", process.env.npm_config_host);
    }

    if (process.env.npm_config_port) {
        args.push("--port", process.env.npm_config_port);
    }

    if (process.env.npm_config_transport) {
        args.push("--transport", process.env.npm_config_transport);
    }

    if (process.env.npm_config_loglevel === "verbose") {
        args.push("--verbose");
    }

    return args;
}

function parseArgs(argv: string[]): CliOptions {
    const options: CliOptions = {
        model: "spark-40",
        host: "127.0.0.1",
        port: 9124,
        verbose: false,
        transport: "tcp",
        tui: true
    };

    const positional: string[] = [];

    for (let i = 0; i < argv.length; i++) {
        const rawArg = argv[i];
        let optionToken = rawArg;
        let inlineValue: string | null = null;

        if (rawArg.startsWith("--")) {
            const eqIdx = rawArg.indexOf("=");
            if (eqIdx > 2) {
                optionToken = rawArg.slice(0, eqIdx);
                inlineValue = rawArg.slice(eqIdx + 1);
            }
        }

        const arg = optionToken.toLowerCase();

        if (arg === "--help" || arg === "-h" || arg === "help") {
            printHelp();
            process.exit(0);
        }

        if (arg === "--models" || arg === "models") {
            console.log(Object.keys(SPARK_MODEL_PROFILES).join("\n"));
            process.exit(0);
        }

        if (arg === "--verbose" || arg === "verbose") {
            options.verbose = true;
            continue;
        }

        if (arg === "--no-tui") {
            options.tui = false;
            continue;
        }

        if (arg === "--ble" || arg === "ble") {
            options.transport = "ble";
            continue;
        }

        if (!arg.startsWith("-") && arg !== "model" && arg !== "host" && arg !== "port" && arg !== "transport") {
            positional.push(rawArg);
            continue;
        }

        const next = argv[i + 1];
        const value = inlineValue ?? next;

        if (value == null) {
            throw new Error(`Missing value for option ${arg}`);
        }

        if (arg === "--model" || arg === "model") {
            options.model = value;
            if (inlineValue == null) {
                i++;
            }
            continue;
        }

        if (arg === "--host" || arg === "host") {
            options.host = value;
            if (inlineValue == null) {
                i++;
            }
            continue;
        }

        if (arg === "--port" || arg === "port") {
            options.port = Number.parseInt(value, 10);
            if (inlineValue == null) {
                i++;
            }
            continue;
        }

        if (arg === "--transport" || arg === "transport") {
            const nextNormalized = value.toLowerCase();
            if (nextNormalized !== "tcp" && nextNormalized !== "ble" && nextNormalized !== "both") {
                throw new Error(`Invalid --transport '${value}'. Expected tcp, ble, or both.`);
            }
            options.transport = nextNormalized;
            if (inlineValue == null) {
                i++;
            }
            continue;
        }

        throw new Error(`Unknown option: ${arg}`);
    }

    if (positional.length > 0) {
        options.model = positional[0];
    }

    if (positional.length > 1) {
        const second = positional[1].toLowerCase();

        // npm on some shells forwards args as: <model> <transport> <host> <port>
        if (isTransportToken(second)) {
            options.transport = second;

            if (positional.length > 2) {
                options.host = positional[2];
            }

            if (positional.length > 3) {
                const parsedPort = tryParsePort(positional[3]);
                options.port = parsedPort == null ? NaN : parsedPort;
            }
        } else {
            const parsedPort = tryParsePort(positional[1]);
            options.port = parsedPort == null ? NaN : parsedPort;

            if (positional.length > 2) {
                options.host = positional[2];
            }
        }
    }

    if (!Number.isFinite(options.port) || options.port <= 0 || options.port > 65535) {
        throw new Error(`Invalid port '${String(options.port)}'.`);
    }

    return options;
}

async function main() {
    const directArgs = process.argv.slice(2);
    const fallbackArgs = readNpmForwardedArgs();
    const npmConfigArgs = readNpmConfigArgs();
    const args = directArgs.length > 0 ? directArgs : (fallbackArgs.length > 0 ? fallbackArgs : npmConfigArgs);

    let options: CliOptions;
    try {
        options = parseArgs(args);
    } catch (err) {
        printHelp();
        throw err;
    }

    const profile = getModelProfile(options.model);

    const tuiEnabled = options.tui && process.stdout.isTTY === true;
    let tui: TuiController | null = null;

    const simulator = new SparkAmpSimulator(profile, {
        logger: (msg) => {
            if (tui) {
                tui.pushLog(msg);
            } else if (options.verbose) {
                console.log(msg);
            }
        }
    });

    const runTcp = options.transport === "tcp" || options.transport === "both";
    const runBle = options.transport === "ble" || options.transport === "both";

    const server = runTcp ? new SparkAmpSimulatorServer(simulator, {
        host: options.host,
        port: options.port,
        verbose: options.verbose,
        logger: (msg) => {
            if (tui) {
                tui.pushLog(msg);
            } else {
                console.log(msg);
            }
        }
    }) : null;

    const peripheral = runBle ? new SparkAmpBlePeripheral(simulator, profile, {
        verbose: options.verbose,
        logger: (msg) => {
            if (tui) {
                tui.pushLog(msg);
            } else {
                console.log(msg);
            }
        }
    }) : null;

    if (server) {
        await server.start();
    }

    if (peripheral) {
        await peripheral.start();
    }

    if (tuiEnabled) {
        tui = createTui(simulator, server, profile.displayName, options.transport);
        tui.pushLog(`Simulator started with ${profile.presetSlots} preset slots`);
        tui.pushLog(`Transport mode: ${options.transport}`);
    } else {
        console.log(`Spark simulator model: ${profile.displayName}`);
        console.log(`Preset slots: ${profile.presetSlots}`);
        console.log(`Transport: ${options.transport}`);
        console.log("Press Ctrl+C to stop.");
    }

    let isShuttingDown = false;

    const shutdown = async () => {
        if (isShuttingDown) {
            return;
        }
        isShuttingDown = true;

        if (tui) {
            tui.pushLog("Shutting down simulator...");
        } else {
            console.log("Shutting down simulator...");
        }
        if (server) {
            await server.stop();
        }
        if (peripheral) {
            await peripheral.stop();
        }
        if (tui) {
            tui.stop();
        }
        process.exit(0);
    };

    process.on("SIGINT", () => {
        void shutdown();
    });

    process.on("SIGTERM", () => {
        void shutdown();
    });
}

void main().catch((err) => {
    console.error(err);
    process.exit(1);
});
