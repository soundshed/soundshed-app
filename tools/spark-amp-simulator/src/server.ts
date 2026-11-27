import net, { Socket } from "net";
import { SparkAmpSimulator } from "./simulator";
import { bytesToHex, parseSparkFrame } from "./protocol";

export interface SparkAmpSimulatorServerOptions {
    host: string;
    port: number;
    verbose: boolean;
    logger?: (msg: string) => void;
}

export interface SparkAmpSimulatorServerStats {
    host: string;
    port: number;
    connectedClients: number;
    rxFrames: number;
    txFrames: number;
}

export class SparkAmpSimulatorServer {
    private server: net.Server;
    private sockets: Set<Socket> = new Set();
    private rxFrames = 0;
    private txFrames = 0;
    private unsubscribeUnsolicited: () => void;

    // Test only: when > 0, the frames of a multi-frame reply are written this many ms
    // apart (in order, per client), so unsolicited frames such as tuner readings can
    // go out between them, as they do on the real amp. 0 writes a reply in one go.
    private replyFrameIntervalMs = 0;

    constructor(private simulator: SparkAmpSimulator, private options: SparkAmpSimulatorServerOptions) {
        this.server = net.createServer((socket) => this.onConnection(socket));
        // e.g. tuner readings: sent to every connected client, the way the amp notifies
        this.unsubscribeUnsolicited = this.simulator.onUnsolicited((frames) => this.broadcast(frames));
    }

    private broadcast(frames: Uint8Array[]) {
        for (const socket of this.sockets) {
            for (const frame of frames) {
                socket.write(Buffer.from(frame));
                this.txFrames += 1;
            }
        }
    }

    /** Test only: spaces out the frames of multi-frame replies (0 turns it off). */
    public setReplyFrameIntervalMs(ms: number) {
        this.replyFrameIntervalMs = Math.max(0, ms);
    }

    private log(msg: string) {
        const logFn = this.options.logger ?? console.log;
        logFn(`[server] ${msg}`);
    }

    private onConnection(socket: Socket) {
        const remote = `${socket.remoteAddress ?? "unknown"}:${socket.remotePort ?? "?"}`;
        this.sockets.add(socket);
        this.log(`client connected ${remote}`);

        let remainder = Buffer.alloc(0);
        // keeps replies in order when their frames are spaced out
        let replyChain: Promise<void> = Promise.resolve();

        const writeReply = (frame: Uint8Array) => {
            if (socket.destroyed) {
                return;
            }
            socket.write(Buffer.from(frame));
            this.txFrames += 1;
            if (this.options.verbose) {
                this.log(`tx ${bytesToHex(frame)}`);
            }
        };

        socket.on("data", (chunk: Buffer) => {
            remainder = Buffer.concat([remainder, chunk]);

            let terminatorIdx = remainder.indexOf(0xf7);
            while (terminatorIdx >= 0) {
                const frame = remainder.subarray(0, terminatorIdx + 1);
                remainder = remainder.subarray(terminatorIdx + 1);
                terminatorIdx = remainder.indexOf(0xf7);

                if (this.options.verbose) {
                    this.log(`rx ${bytesToHex(frame)}`);
                }

                this.rxFrames += 1;

                const parsed = parseSparkFrame(frame);
                if (!parsed) {
                    this.log("Ignored non-protocol frame");
                    continue;
                }

                const responses = this.simulator.handleMessage(parsed);
                const interval = this.replyFrameIntervalMs;
                if (interval > 0) {
                    replyChain = replyChain.then(async () => {
                        for (let i = 0; i < responses.length; i++) {
                            if (i > 0) {
                                await new Promise((resolve) => setTimeout(resolve, interval));
                            }
                            writeReply(responses[i]);
                        }
                    });
                } else {
                    for (const response of responses) {
                        writeReply(response);
                    }
                }
            }
        });

        socket.on("error", (err) => {
            this.log(`client error ${remote}: ${err.message}`);
        });

        socket.on("close", () => {
            this.sockets.delete(socket);
            this.log(`client disconnected ${remote}`);
        });
    }

    public getStats(): SparkAmpSimulatorServerStats {
        return {
            host: this.options.host,
            port: this.options.port,
            connectedClients: this.sockets.size,
            rxFrames: this.rxFrames,
            txFrames: this.txFrames
        };
    }

    public async start(): Promise<void> {
        await new Promise<void>((resolve, reject) => {
            this.server.once("error", reject);
            this.server.listen(this.options.port, this.options.host, () => {
                this.server.off("error", reject);
                resolve();
            });
        });

        this.log(`listening on ${this.options.host}:${this.options.port}`);
    }

    public async stop(): Promise<void> {
        this.unsubscribeUnsolicited();

        // Force-close active clients so server.close does not hang waiting for them.
        for (const socket of this.sockets) {
            try {
                socket.destroy();
            } catch {
            }
        }
        this.sockets.clear();

        await new Promise<void>((resolve) => {
            this.server.close(() => resolve());
        });
    }
}
