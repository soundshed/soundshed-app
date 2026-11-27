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

// The app's own TCP transport and device manager, so a step can drive the same receive
// path the app uses (receive queue, 50 ms read loop, SparkMessageReader).
function loadAppTransportModules() {
    const sporkDir = path.resolve(process.cwd(), "build/spork/src/devices/spark");
    const tcpPath = path.join(sporkDir, "tcpProvider.js");
    const managerPath = path.join(sporkDir, "sparkDeviceManager.js");

    if (!fs.existsSync(tcpPath) || !fs.existsSync(managerPath)) {
        throw new Error("Missing compiled TcpProvider/SparkDeviceManager under build/. Run 'npx tsc' before sim:spark:test.");
    }

    // TcpProvider gets 'net' through window.require, as in the Electron renderer.
    const g = globalThis as any;
    if (g.window == null) {
        g.window = { require };
    }

    return {
        TcpProvider: require(tcpPath).TcpProvider,
        SparkDeviceManager: require(managerPath).SparkDeviceManager
    };
}

// The app modules log every message they handle; keep the test output readable.
function silenceConsole(): () => void {
    const saved = { log: console.log, info: console.info, debug: console.debug };
    console.log = () => undefined;
    console.info = () => undefined;
    console.debug = () => undefined;
    return () => {
        console.log = saved.log;
        console.info = saved.info;
        console.debug = saved.debug;
    };
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor<T>(check: () => T | undefined, timeoutMs: number): Promise<T | undefined> {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
        const value = check();
        if (value) {
            return value;
        }
        await sleep(20);
    }
    return check();
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

        await runStep("Tuner streams 03 64 every ~60 ms until switched off (01 65 / 02 65)", async () => {
            // the stream never goes quiet, so this collects until the 1 s timeout
            const onResponses = await client.sendAndCollect(command.switch_tuner(true), 100, 1000);
            ensure(countCmdSub(onResponses, 0x04, 0x65) > 0, "Expected ACK cmd=04 sub=65 for tuner on");
            const readings = countCmdSub(onResponses, 0x03, 0x64);
            ensure(readings >= 10, `Expected a reading about every 60 ms, got ${readings} in 1 s`);
            const parsedReadings = parseMessages(onResponses, SparkMessageReader).filter((m) => m.type === "tuner_output");
            ensure(parsedReadings.length === readings, `Expected ${readings} tuner_output messages, got ${parsedReadings.length}`);

            const stateResponses = await client.sendAndCollect(command.request_tuner_state(), 100, 300);
            const state = parseMessages(stateResponses, SparkMessageReader).find((m) => m.type === "tuner_onoff");
            ensure(!!state && state.enabled === true, "Expected 02 65 to report the tuner as on");

            const offResponses = await client.sendAndCollect(command.switch_tuner(false), 100, 1000);
            ensure(countCmdSub(offResponses, 0x04, 0x65) > 0, "Expected ACK cmd=04 sub=65 for tuner off");
            ensure(!simulator.isTunerEnabled(), "Simulator tuner should be off");

            const silence = await client.sendAndCollect([], 100, 400);
            ensure(countCmdSub(silence, 0x03, 0x64) === 0, "Expected no readings once the tuner is off");
        }, results);

        await runStep("App TCP receive path keeps up with a streaming tuner", async () => {
            const restoreConsole = opts.verbose ? () => undefined : silenceConsole();
            const { TcpProvider, SparkDeviceManager } = loadAppTransportModules();
            const provider = new TcpProvider({ host: opts.host, port: opts.port, model: opts.model });
            const manager = new SparkDeviceManager(provider);

            const received: any[] = [];
            let incompleteMessages = 0;
            manager.onStateChanged = (s: any) => {
                if (s?.message) {
                    received.push(s.message);
                }
            };
            manager.onIncompleteMessage = () => {
                incompleteMessages++;
            };
            const readingCount = () => received.filter((m) => m.type === "tuner_output").length;

            // Every chunk the app's receive queue is given, in arrival order, to check that
            // readings really did arrive between the chunks of the preset reply.
            const arrivals: Uint8Array[] = [];
            const receiveQueue = provider.receiveQueue;
            const queuePush = receiveQueue.push.bind(receiveQueue);
            receiveQueue.push = (chunk: Uint8Array) => {
                arrivals.push(chunk);
                queuePush(chunk);
            };
            const isPresetChunk = (c: Uint8Array) => c[0] === 0xf0 && c[4] === 0x03 && c[5] === 0x01;
            const isReading = (c: Uint8Array) => c[0] === 0xf0 && c[4] === 0x03 && c[5] === 0x64;

            try {
                const [device] = await provider.scanForDevices();
                ensure(await manager.connect(device), "App transport could not connect to the simulator");

                ensure(await manager.setTunerEnabled(true), "setTunerEnabled(true) failed");
                await sleep(1000);
                const readingsWhileOn = readingCount();
                ensure(readingsWhileOn >= 8, `Expected the app to receive tuner readings while they stream, got ${readingsWhileOn} in 1 s`);

                // A multi-chunk preset reply in the middle of the stream. The simulator
                // normally writes a reply's frames in one go, so space them out by more
                // than a tuner interval: readings then arrive between the preset's chunks,
                // as they can on the real amp, and the receive queue has to hold the
                // unfinished preset back while it keeps delivering the readings.
                server.setReplyFrameIntervalMs(90);
                try {
                    await manager.sendCommand("get_tuner_state", {});
                    await manager.sendCommand("get_preset", 0);
                    const preset = await waitFor(() => received.find((m) => m.type === "preset"), 4000);
                    ensure(!!preset, "Expected the preset reply to be delivered while the tuner streams");
                } finally {
                    server.setReplyFrameIntervalMs(0);
                }
                await sleep(200);

                const presetIdx = arrivals.map((c, i) => (isPresetChunk(c) ? i : -1)).filter((i) => i >= 0);
                ensure(presetIdx.length > 1, `Expected a multi-chunk preset reply, got ${presetIdx.length} chunk(s)`);
                const between = arrivals.slice(presetIdx[0], presetIdx[presetIdx.length - 1]).filter(isReading).length;
                ensure(between > 0, "Expected tuner readings to arrive between the preset's chunks");
                const presets = received.filter((m) => m.type === "preset").length;
                ensure(presets === 1, `Expected exactly one preset, got ${presets}`);
                ensure(incompleteMessages === 0, `Expected the preset in one piece, ${incompleteMessages} incomplete message(s)`);
                ensure(received.some((m) => m.type === "tuner_onoff" && m.enabled === true), "Expected 03 65 on for the tuner state query");

                const beforePause = readingCount();
                await sleep(300);
                ensure(readingCount() > beforePause, "Readings stopped arriving after the preset reply");

                ensure(await manager.setTunerEnabled(false), "setTunerEnabled(false) failed");
                await sleep(300);
                ensure(!simulator.isTunerEnabled(), "The tuner-off command did not reach the simulator");
                const afterOff = readingCount();
                await sleep(400);
                ensure(readingCount() === afterOff, "Readings kept arriving after the tuner was switched off");
            } finally {
                await manager.disconnect().catch(() => undefined);
                restoreConsole();
            }
        }, results);
        await runStep("Read mixer defaults (02 33 -> 03 33)", async () => {
            const expected: [number, number][] = [[0, 0.5], [5, 0.5], [9, 0.7]];
            for (const [channel, value] of expected) {
                const responses = await client.sendAndCollect(command.request_mixer_volume(channel));
                ensure(countCmdSub(responses, 0x03, 0x33) > 0, `Expected response cmd=03 sub=33 for channel ${channel}`);

                const messages = parseMessages(responses, SparkMessageReader);
                const volume = messages.find((m) => m.type === "mixer_volume");
                ensure(!!volume, `Expected mixer_volume parser message for channel ${channel}`);
                ensure(Math.abs(volume.value - value) < 1e-6, `Expected channel ${channel} volume ${value}, got ${String(volume.value)}`);
            }
        }, results);

        await runStep("Set mixer volume with and without trailing 00 (01 33 -> 04 33)", async () => {
            const musicResponses = await client.sendAndCollect(command.set_mixer_volume(5, 0.25, false));
            ensure(countCmdSub(musicResponses, 0x04, 0x33) > 0, "Expected ACK cmd=04 sub=33 for music volume");
            ensure(countCmdSub(musicResponses, 0x03, 0x6b) === 0, "Did not expect 03 6b for a music volume change");
            ensure(
                parseMessages(musicResponses, SparkMessageReader).some((m) => m.type === "mixer_ack"),
                "Expected mixer_ack parser message"
            );
            ensure(Math.abs((simulator.getMixerVolume(5) ?? -1) - 0.25) < 1e-6, "Simulator did not store music volume 0.25");

            const readBack = await client.sendAndCollect(command.request_mixer_volume(5));
            const readMsg = parseMessages(readBack, SparkMessageReader).find((m) => m.type === "mixer_volume");
            ensure(!!readMsg && Math.abs(readMsg.value - 0.25) < 1e-6, "Expected to read back music volume 0.25");

            const guitarResponses = await client.sendAndCollect(command.set_mixer_volume(0, 0.3, true));
            ensure(countCmdSub(guitarResponses, 0x04, 0x33) > 0, "Expected ACK cmd=04 sub=33 for guitar volume");
            ensure(countCmdSub(guitarResponses, 0x03, 0x6b) > 0, "Expected 03 6b input volume after a guitar change");
            const input = parseMessages(guitarResponses, SparkMessageReader).find((m) => m.type === "input_volume");
            ensure(!!input && Math.abs(input.value - 0.3) < 1e-6, "Expected input_volume 0.3 parser message");
            ensure(Math.abs((simulator.getMixerVolume(0) ?? -1) - 0.3) < 1e-6, "Simulator did not store guitar volume 0.3");
        }, results);
    } finally {
        simulator.dispose();
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
