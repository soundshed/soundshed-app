import net from "net";
import path from "path";
import fs from "fs";
import { getModelProfile } from "./models";
import { SparkAmpSimulator } from "./simulator";
import { SparkAmpSimulatorServer } from "./server";

interface TestOptions {
    model: string;
    host: string;
    port: number;
    verbose: boolean;
}

interface CmdSub {
    cmd: number;
    subCmd: number;
}

interface StepResult {
    name: string;
    ok: boolean;
    detail?: string;
}

interface SlotPresetSnapshot {
    slot: number;
    preset: any;
}

class TcpFrameClient {
    private socket: net.Socket | null = null;
    private remainder = Buffer.alloc(0);
    private frames: Uint8Array[] = [];

    constructor(private host: string, private port: number) {}

    public async connect(): Promise<void> {
        await new Promise<void>((resolve, reject) => {
            const socket = net.createConnection({ host: this.host, port: this.port }, () => {
                this.socket = socket;
                resolve();
            });

            socket.on("data", (chunk: Buffer) => {
                this.remainder = Buffer.concat([this.remainder, chunk]);

                let idx = this.remainder.indexOf(0xf7);
                while (idx >= 0) {
                    const frame = this.remainder.subarray(0, idx + 1);
                    this.frames.push(new Uint8Array(frame));
                    this.remainder = this.remainder.subarray(idx + 1);
                    idx = this.remainder.indexOf(0xf7);
                }
            });

            socket.on("error", (err) => {
                if (!this.socket) {
                    reject(err);
                }
            });
        });
    }

    public async disconnect(): Promise<void> {
        if (!this.socket) {
            return;
        }

        await new Promise<void>((resolve) => {
            this.socket?.end(() => resolve());
        });

        this.socket.destroy();
        this.socket = null;
    }

    public async sendAndCollect(frames: Uint8Array[], quietMs = 100, timeoutMs = 2500): Promise<Uint8Array[]> {
        const socket = this.socket;
        if (!socket) {
            throw new Error("TCP client is not connected");
        }

        const startIndex = this.frames.length;

        for (const frame of frames) {
            await new Promise<void>((resolve, reject) => {
                socket.write(Buffer.from(frame), (err: Error | null | undefined) => {
                    if (err != null) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            });
        }

        return this.waitForQuiet(startIndex, quietMs, timeoutMs);
    }

    private async waitForQuiet(startIndex: number, quietMs: number, timeoutMs: number): Promise<Uint8Array[]> {
        const started = Date.now();
        let lastCount = this.frames.length;
        let lastActivity = Date.now();

        return new Promise<Uint8Array[]>((resolve) => {
            const timer = setInterval(() => {
                if (this.frames.length !== lastCount) {
                    lastCount = this.frames.length;
                    lastActivity = Date.now();
                }

                const elapsed = Date.now() - started;
                const quietFor = Date.now() - lastActivity;
                const hasAny = this.frames.length > startIndex;

                if ((hasAny && quietFor >= quietMs) || elapsed >= timeoutMs) {
                    clearInterval(timer);
                    resolve(this.frames.slice(startIndex));
                }
            }, 15);
        });
    }
}

function parseArgs(argv: string[]): TestOptions {
    const options: TestOptions = {
        model: "spark-2",
        host: "127.0.0.1",
        port: 9124,
        verbose: true
    };

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i].toLowerCase();
        const next = argv[i + 1];

        if ((arg === "--model" || arg === "model") && next) {
            options.model = next;
            i++;
            continue;
        }

        if ((arg === "--host" || arg === "host") && next) {
            options.host = next;
            i++;
            continue;
        }

        if ((arg === "--port" || arg === "port") && next) {
            const parsed = Number.parseInt(next, 10);
            if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 65535) {
                throw new Error(`Invalid --port value '${next}'`);
            }
            options.port = parsed;
            i++;
            continue;
        }

        if (arg === "--verbose" || arg === "verbose") {
            options.verbose = true;
            continue;
        }

        if (arg === "--no-verbose") {
            options.verbose = false;
            continue;
        }

        if (arg === "--help" || arg === "-h" || arg === "help") {
            console.log("Spark TCP integration test");
            console.log("");
            console.log("Usage:");
            console.log("  node tcpIntegrationTest.js [--model spark-2] [--host 127.0.0.1] [--port 9124] [--verbose]");
            process.exit(0);
        }
    }

    return options;
}

function ensure(condition: boolean, message: string) {
    if (!condition) {
        throw new Error(message);
    }
}

function decodeCmdSub(frame: Uint8Array): CmdSub | null {
    let chunk = frame;
    if (chunk.length > 16 && chunk[0] === 0x01 && chunk[1] === 0xfe) {
        chunk = chunk.subarray(16);
    }

    if (chunk.length < 7 || chunk[0] !== 0xf0) {
        return null;
    }

    return {
        cmd: chunk[4],
        subCmd: chunk[5]
    };
}

function countCmdSub(frames: Uint8Array[], cmd: number, subCmd: number): number {
    return frames.reduce((count, frame) => {
        const parsed = decodeCmdSub(frame);
        if (parsed && parsed.cmd === cmd && parsed.subCmd === subCmd) {
            return count + 1;
        }

        return count;
    }, 0);
}

function loadSporkModules() {
    const sporkDir = path.resolve(process.cwd(), "build/spork/src/devices/spark");
    const cmdPath = path.join(sporkDir, "sparkCommandMessage.js");
    const readerPath = path.join(sporkDir, "sparkMessageReader.js");

    if (!fs.existsSync(cmdPath) || !fs.existsSync(readerPath)) {
        throw new Error(
            "Missing compiled spork modules under build/. Run 'npx tsc' (or npm run build-electron/build-web) before sim:spark:test."
        );
    }

    const commandModule = require(cmdPath);
    const readerModule = require(readerPath);

    if (!commandModule?.SparkCommandMessage || !readerModule?.SparkMessageReader) {
        throw new Error("Failed loading SparkCommandMessage/SparkMessageReader from build output.");
    }

    return {
        SparkCommandMessage: commandModule.SparkCommandMessage,
        SparkMessageReader: readerModule.SparkMessageReader
    };
}

function normalizeFramesForReader(frames: Uint8Array[]): Uint8Array[] {
    return frames.map((frame) => {
        if (frame.length > 16 && frame[0] === 0x01 && frame[1] === 0xfe) {
            return frame.subarray(16);
        }

        return frame;
    });
}

function parseMessages(frames: Uint8Array[], SparkMessageReaderCtor: any): any[] {
    if (frames.length === 0) {
        return [];
    }

    const normalized = normalizeFramesForReader(frames);

    const reader = new SparkMessageReaderCtor();
    reader.set_message(normalized);
    reader.read_message();
    return reader.readMessageQueue();
}

function logJson(label: string, value: unknown) {
    console.log(`\n${label}:`);
    console.log(JSON.stringify(value, null, 2));
}

async function readPresetFromSlot(
    client: TcpFrameClient,
    command: any,
    SparkMessageReader: any,
    slot: number
): Promise<any> {
    const responses = await client.sendAndCollect(command.request_preset_state(slot));
    const messages = parseMessages(responses, SparkMessageReader);
    const presetMsg = messages.find((m) => m.type === "preset");
    ensure(!!presetMsg, `Expected parsed preset message for slot ${slot}`);
    return presetMsg.value;
}

async function readAllSimulatedPresets(
    client: TcpFrameClient,
    command: any,
    SparkMessageReader: any,
    slotCount: number
): Promise<SlotPresetSnapshot[]> {
    const snapshots: SlotPresetSnapshot[] = [];

    for (let slot = 0; slot < slotCount; slot++) {
        const preset = await readPresetFromSlot(client, command, SparkMessageReader, slot);
        snapshots.push({ slot, preset });
    }

    return snapshots;
}

async function runStep(name: string, fn: () => Promise<void>, results: StepResult[]) {
    try {
        await fn();
        console.log(`[PASS] ${name}`);
        results.push({ name, ok: true });
    } catch (err) {
        const detail = (err as Error).message;
        console.error(`[FAIL] ${name}: ${detail}`);
        results.push({ name, ok: false, detail });
    }
}

async function main() {
    const opts = parseArgs(process.argv.slice(2));
    const { SparkCommandMessage, SparkMessageReader } = loadSporkModules();

    const profile = getModelProfile(opts.model);

    const simulator = new SparkAmpSimulator(profile, {
        logger: (msg) => {
            if (opts.verbose) {
                console.log(msg);
            }
        }
    });

    const server = new SparkAmpSimulatorServer(simulator, {
        host: opts.host,
        port: opts.port,
        verbose: opts.verbose,
        logger: (msg) => console.log(msg)
    });

    const client = new TcpFrameClient(opts.host, opts.port);
    const command = new SparkCommandMessage({ spark2: true });

    const results: StepResult[] = [];
    let latestPreset: any = null;
    let uploadedPreset: any = null;

    try {
        await server.start();
        await client.connect();

        console.log(`Running Spark TCP integration test on ${opts.host}:${opts.port} using model ${opts.model}`);

        await runStep("Get selected channel", async () => {
            const responses = await client.sendAndCollect(command.request_info(0x10));
            ensure(countCmdSub(responses, 0x03, 0x10) > 0, "Expected response cmd=03 sub=10");

            const messages = parseMessages(responses, SparkMessageReader);
            const channelMsg = messages.find((m) => m.type === "hardware_channel_current");
            ensure(!!channelMsg, "Expected hardware_channel_current message");
        }, results);

        await runStep("Get device name", async () => {
            const responses = await client.sendAndCollect(command.request_info(0x11));
            ensure(countCmdSub(responses, 0x03, 0x11) > 0, "Expected response cmd=03 sub=11");
        }, results);

        await runStep("Get device serial", async () => {
            const responses = await client.sendAndCollect(command.request_info(0x23));
            ensure(countCmdSub(responses, 0x03, 0x23) > 0, "Expected response cmd=03 sub=23");
        }, results);

        await runStep("Get preset slot 0", async () => {
            const responses = await client.sendAndCollect(command.request_preset_state(0));
            ensure(countCmdSub(responses, 0x03, 0x01) > 0, "Expected response cmd=03 sub=01");

            const messages = parseMessages(responses, SparkMessageReader);
            const presetMsg = messages.find((m) => m.type === "preset");
            ensure(!!presetMsg, "Expected parsed preset message");

            latestPreset = presetMsg.value;
            ensure(!!latestPreset?.sigpath?.length, "Preset payload did not contain a signal path");

            logJson("Received preset JSON (slot 0)", latestPreset);
        }, results);

        await runStep("Log simulated amp presets JSON", async () => {
            const snapshots = await readAllSimulatedPresets(client, command, SparkMessageReader, profile.presetSlots);
            logJson("Simulated amp presets JSON", snapshots);
        }, results);

        await runStep("Switch channel and verify", async () => {
            const switchResponses = await client.sendAndCollect(command.change_hardware_preset(1));
            ensure(countCmdSub(switchResponses, 0x04, 0x38) > 0, "Expected ACK cmd=04 sub=38");

            const selectedResponses = await client.sendAndCollect(command.request_info(0x10));
            const messages = parseMessages(selectedResponses, SparkMessageReader);
            const channelMsg = messages.find((m) => m.type === "hardware_channel_current");
            ensure(!!channelMsg, "Expected hardware_channel_current after switch");
            ensure(channelMsg.presetNumber === 1, `Expected selected channel 1, got ${String(channelMsg.presetNumber)}`);
        }, results);

        await runStep("Upload preset chunks with Spark 2 ACK flow", async () => {
            ensure(!!latestPreset, "No baseline preset available for upload test");
            latestPreset.meta = latestPreset.meta ?? {};
            latestPreset.meta.name = `${latestPreset.meta.name || "SimPreset"} (integration)`;

            uploadedPreset = JSON.parse(JSON.stringify(latestPreset));
            logJson("Received preset JSON (sent back to simulated amp)", uploadedPreset);

            const uploadFrames: Uint8Array[] = command.create_preset_from_model(uploadedPreset, 0x7f);
            const responses = await client.sendAndCollect(uploadFrames, 120, 3500);

            const ackChunk = countCmdSub(responses, 0x05, 0x01);
            const ackFinal = countCmdSub(responses, 0x04, 0x01);

            if (uploadFrames.length > 1) {
                ensure(ackChunk > 0, "Expected at least one chunk ACK cmd=05 sub=01");
            }
            ensure(ackFinal > 0, "Expected final ACK cmd=04 sub=01");

            const slotOnePreset = await readPresetFromSlot(client, command, SparkMessageReader, 1);
            logJson("Simulated amp preset JSON after upload (slot 1)", slotOnePreset);
        }, results);

        await runStep("Request live sync", async () => {
            const responses = await client.sendAndCollect(command.request_live_sync());
            ensure(countCmdSub(responses, 0x03, 0x1a) > 0, "Expected response cmd=03 sub=1a");
            ensure(countCmdSub(responses, 0x03, 0x62) > 0, "Expected response cmd=03 sub=62 after upload");

            const messages = parseMessages(responses, SparkMessageReader);
            ensure(messages.some((m) => m.type === "spark2_live_sync"), "Expected spark2_live_sync parser message");
            ensure(messages.some((m) => m.type === "spark2_post_upload_ack"), "Expected spark2_post_upload_ack parser message");
        }, results);

        await runStep("Store current preset", async () => {
            const responses = await client.sendAndCollect(command.store_current_preset(2));
            ensure(countCmdSub(responses, 0x03, 0x27) > 0, "Expected response cmd=03 sub=27");
        }, results);

        await runStep("Exercise amp/effect/toggle/param ACK commands", async () => {
            const ampResponses = await client.sendAndCollect(command.change_amp("Twin", "Twin"));
            ensure(countCmdSub(ampResponses, 0x04, 0x06) > 0, "Expected ACK cmd=04 sub=06 for amp change");

            const fxResponses = await client.sendAndCollect(command.change_effect("Compressor", "Booster"));
            ensure(countCmdSub(fxResponses, 0x04, 0x06) > 0, "Expected ACK cmd=04 sub=06 for fx change");

            // Simulator currently accepts cmd 01/04 writes without returning a dedicated ACK frame.
            await client.sendAndCollect(command.change_effect_parameter("Compressor", 0, 0.55));

            const toggleResponses = await client.sendAndCollect(command.turn_effect_onoff("Compressor", "On"));
            ensure(countCmdSub(toggleResponses, 0x04, 0x15) > 0, "Expected ACK cmd=04 sub=15 for fx toggle");
        }, results);
    } finally {
        await client.disconnect().catch(() => undefined);
        await server.stop().catch(() => undefined);
    }

    const passCount = results.filter((r) => r.ok).length;
    const failCount = results.length - passCount;

    console.log("\n=== Spark TCP Integration Test Summary ===");
    console.log(`Total: ${results.length}`);
    console.log(`Pass : ${passCount}`);
    console.log(`Fail : ${failCount}`);

    if (failCount > 0) {
        for (const result of results.filter((r) => !r.ok)) {
            console.log(` - ${result.name}: ${result.detail}`);
        }
        process.exit(1);
    }

    process.exit(0);
}

void main().catch((err) => {
    console.error(err);
    process.exit(1);
});
