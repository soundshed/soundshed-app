import { SerialCommsProvider } from "../../interfaces/serialCommsProvider";
import { BluetoothDeviceInfo } from "../../interfaces/deviceController";
import { SparkMessageReader } from "./sparkMessageReader";

interface TcpProviderOptions {
    host?: string;
    port?: number;
    model?: string;
    verbose?: boolean;
}

export class TcpProvider implements SerialCommsProvider {
    private socket: any = null;
    private isConnected = false;
    private isReceiving = false;
    private receiveQueue: Array<Uint8Array> = [];
    private remainder: Uint8Array = new Uint8Array();
    private lastMsgReceivedTime: Date = null;
    private lastMsgSentTime: Date = null;
    private isSendQueueProcessing = false;
    private sendQueue: Array<Uint8Array> = [];
    private isSpark2ConnectionActive = false;
    private connectedHost: string;
    private connectedPort: number;

    private minWaitTimeMSBetweenCommands = 50;
    private minWaitTimeForMessageQueue = 80;

    private pendingAckWaiters: {
        cmd: number[];
        subCmd: number;
        resolve: (value: boolean) => void;
        timeoutHandle: ReturnType<typeof setTimeout>;
    }[] = [];

    private recentAcks: { cmd: number; subCmd: number; at: number }[] = [];

    constructor(private options: TcpProviderOptions = {}) {
        this.connectedHost = options.host ?? "127.0.0.1";
        this.connectedPort = options.port ?? 9124;
    }

    private logError(msg: string) {
        console.error("[TCP Provider] : " + msg);
    }

    private getNetModule(): any {
        const maybeWindow = window as any;
        if (!maybeWindow || typeof maybeWindow.require !== "function") {
            const detail = "TCP simulator mode requires Electron renderer with Node integration enabled (window.require missing).";
            this.logError(detail);
            throw new Error(detail);
        }

        return maybeWindow.require("net");
    }

    private getDeviceName(): string {
        const model = (this.options.model ?? "spark-2").toLowerCase();
        if (model.includes("spark-2") || model.includes("spark 2")) {
            return "Spark 2 (TCP Simulator)";
        }

        if (model.includes("spark-mini") || model.includes("spark mini")) {
            return "Spark MINI (TCP Simulator)";
        }

        if (model.includes("spark-go") || model.includes("spark go")) {
            return "Spark GO (TCP Simulator)";
        }

        if (model.includes("spark-neo") || model.includes("spark neo")) {
            return "Spark NEO (TCP Simulator)";
        }

        return "Spark 40 (TCP Simulator)";
    }

    private log(msg: string) {
        if (!this.options.verbose) {
            return;
        }

        console.debug("[TCP Provider] : " + msg);
    }

    private bytesToHex(buffer: Uint8Array | ArrayBuffer): string {
        return Array.prototype.map.call(new Uint8Array(buffer), (x) => ("00" + x.toString(16)).slice(-2)).join("");
    }

    private getTimeDeltaSinceLastMsg(): number {
        if (this.lastMsgReceivedTime != null) {
            const current = new Date();
            return Math.abs(current.getTime() - this.lastMsgReceivedTime.getTime());
        }

        this.lastMsgReceivedTime = new Date();
        return 0;
    }

    private getTimeDeltaSinceLastCmd(): number {
        if (this.lastMsgSentTime != null) {
            const current = new Date();
            return Math.abs(current.getTime() - this.lastMsgSentTime.getTime());
        }

        this.lastMsgSentTime = new Date();
        return 0;
    }

    private mergeBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
        return SparkMessageReader.mergeBytes(a, b);
    }

    private splitFramesByTerminator(input: Uint8Array): Uint8Array[] {
        const all = this.mergeBytes(this.remainder, input);
        const frames: Uint8Array[] = [];

        let start = 0;
        for (let i = 0; i < all.length; i++) {
            if (all[i] === 0xf7) {
                frames.push(all.slice(start, i + 1));
                start = i + 1;
            }
        }

        this.remainder = all.slice(start);
        return frames;
    }

    private trimHeader(data: Uint8Array): Uint8Array {
        // Spark block frames may include a 16-byte transport header.
        // SparkMessageReader expects chunk payload starting at 0xF0.
        if (data.length > 16 && data[0] === 0x01 && data[1] === 0xfe) {
            return data.subarray(16);
        }

        return data;
    }

    private notifyAckWaiters(message: Uint8Array) {
        if (message.length < 6) {
            return;
        }

        const cmd = message[4];
        const subCmd = message[5];

        if (cmd !== 0x04 && cmd !== 0x05) {
            return;
        }

        const now = Date.now();
        this.recentAcks.push({ cmd, subCmd, at: now });
        this.recentAcks = this.recentAcks.filter(item => now - item.at < 5000);

        for (let i = this.pendingAckWaiters.length - 1; i >= 0; i--) {
            const waiter = this.pendingAckWaiters[i];
            if (waiter.subCmd === subCmd && waiter.cmd.includes(cmd)) {
                clearTimeout(waiter.timeoutHandle);
                waiter.resolve(true);
                this.pendingAckWaiters.splice(i, 1);
            }
        }
    }

    public async scanForDevices(): Promise<BluetoothDeviceInfo[]> {
        return [{
            name: this.getDeviceName(),
            address: this.connectedHost,
            port: this.connectedPort,
            description: "TCP simulator endpoint"
        }];
    }

    public async connect(device: BluetoothDeviceInfo): Promise<boolean> {
        if (this.isConnected) {
            return true;
        }

        const host = device?.address || this.connectedHost;
        const port = (device?.port && device.port > 0) ? device.port : this.connectedPort;

        this.connectedHost = host;
        this.connectedPort = port;
        this.isSpark2ConnectionActive = (device?.name || this.getDeviceName()).toLowerCase().includes("spark 2");

        const net = this.getNetModule();

        try {
            await new Promise<void>((resolve, reject) => {
                const socket = net.createConnection({ host, port }, () => {
                    this.socket = socket;
                    this.isConnected = true;
                    this.log(`Connected to ${host}:${port}`);
                    resolve();
                });

                socket.on("data", (chunk: Uint8Array) => {
                    this.lastMsgReceivedTime = new Date();

                    const dataChunk = new Uint8Array(chunk);
                    const frames = this.splitFramesByTerminator(dataChunk);
                    for (const frame of frames) {
                        const normalized = this.trimHeader(frame);
                        this.receiveQueue.push(normalized);
                        this.notifyAckWaiters(normalized);
                        this.log(`[RECV RAW TCP]: ${this.bytesToHex(normalized)}`);
                    }
                });

                socket.on("close", () => {
                    this.log("Socket closed");
                    this.isConnected = false;
                    this.socket = null;
                });

                socket.on("error", (err: Error) => {
                    this.logError(`Socket error (${host}:${port}): ${err.message}`);
                    if (!this.isConnected) {
                        reject(err);
                    }
                });
            });

            return true;
        } catch (err) {
            this.logError(`Failed to connect to ${host}:${port}: ${(err as Error).message}`);
            this.logError("Check that simulator host/port match env settings and that app is running in Electron mode for tcp-sim transport.");
            this.isConnected = false;
            this.socket = null;
            return false;
        }
    }

    public async disconnect(): Promise<void> {
        if (this.socket) {
            try {
                this.socket.end();
                this.socket.destroy();
            } catch {
            }
        }

        this.socket = null;
        this.isConnected = false;
        this.isReceiving = false;
        this.remainder = new Uint8Array();
        this.receiveQueue = [];

        for (const waiter of this.pendingAckWaiters) {
            clearTimeout(waiter.timeoutHandle);
            waiter.resolve(false);
        }
        this.pendingAckWaiters = [];
        this.recentAcks = [];
    }

    public async beginQueuedReceive(): Promise<boolean> {
        this.isReceiving = this.isConnected;
        return this.isConnected;
    }

    public readReceiveQueue(): Array<Uint8Array> {
        if (this.receiveQueue.length === 0) {
            return null;
        }

        if (this.getTimeDeltaSinceLastMsg() < this.minWaitTimeForMessageQueue) {
            return null;
        }

        const lastItem = this.receiveQueue[this.receiveQueue.length - 1];
        if (lastItem[lastItem.length - 1] !== 0xf7) {
            return null;
        }

        const received = [...this.receiveQueue];
        this.receiveQueue = [];
        return received;
    }

    public peekReceiveQueueEnd(): Uint8Array {
        if (this.receiveQueue.length === 0) {
            return null;
        }

        const lastItem = this.receiveQueue[this.receiveQueue.length - 1];
        if (lastItem[lastItem.length - 1] === 0xf7) {
            return lastItem;
        }

        return null;
    }

    public async write(msg: any): Promise<void> {
        if (!this.socket || !this.isConnected) {
            throw new Error("Not connected to TCP simulator");
        }

        const data = new Uint8Array(msg);
        this.sendQueue.unshift(data);

        if (this.isSendQueueProcessing) {
            return;
        }

        this.isSendQueueProcessing = true;
        try {
            while (this.sendQueue.length > 0) {
                while (this.getTimeDeltaSinceLastCmd() < this.minWaitTimeMSBetweenCommands) {
                    await new Promise(resolve => setTimeout(resolve, this.minWaitTimeMSBetweenCommands));
                }

                const currentMsg = this.sendQueue.pop();
                this.lastMsgSentTime = new Date();

                this.log(`[SEND RAW TCP]: ${this.bytesToHex(currentMsg)}`);

                await new Promise<void>((resolve, reject) => {
                    this.socket.write(Buffer.from(currentMsg), (err: Error | undefined) => {
                        if (err) {
                            reject(err);
                        } else {
                            resolve();
                        }
                    });
                });
            }
        } finally {
            this.isSendQueueProcessing = false;
        }
    }

    public waitForAck(cmd: number | number[], subCmd: number, timeoutMs: number = 3000): Promise<boolean> {
        const cmdList = Array.isArray(cmd) ? cmd : [cmd];

        const existingAckIndex = this.recentAcks.findIndex(ack => ack.subCmd === subCmd && cmdList.includes(ack.cmd));
        if (existingAckIndex >= 0) {
            this.recentAcks.splice(existingAckIndex, 1);
            return Promise.resolve(true);
        }

        return new Promise((resolve) => {
            const timeoutHandle = setTimeout(() => {
                const idx = this.pendingAckWaiters.findIndex(waiter => waiter.timeoutHandle === timeoutHandle);
                if (idx >= 0) {
                    this.pendingAckWaiters.splice(idx, 1);
                }
                resolve(false);
            }, timeoutMs);

            this.pendingAckWaiters.push({
                cmd: cmdList,
                subCmd,
                resolve,
                timeoutHandle
            });
        });
    }

    public isSpark2Connection(): boolean {
        return this.isSpark2ConnectionActive;
    }
}
