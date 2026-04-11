import { SparkModelProfile } from "./models";
import { bytesToHex, parseSparkFrame } from "./protocol";
import { SparkAmpSimulator } from "./simulator";

interface BlenoModule {
    on(event: string, handler: (...args: unknown[]) => void): void;
    removeListener(event: string, handler: (...args: unknown[]) => void): void;
    startAdvertising(name: string, serviceUuids: string[], callback?: (error?: Error) => void): void;
    stopAdvertising(callback?: () => void): void;
    setServices(services: unknown[], callback?: (error?: Error) => void): void;
    Characteristic: new (options: Record<string, unknown>) => unknown;
    PrimaryService: new (options: Record<string, unknown>) => unknown;
}

export interface SparkAmpBlePeripheralOptions {
    verbose: boolean;
    logger?: (msg: string) => void;
}

export class SparkAmpBlePeripheral {
    private bleno: BlenoModule | null = null;
    private notifyCallback: ((data: Buffer) => void) | null = null;
    private maxNotifySize = 20;
    private rxRemainder = Buffer.alloc(0);

    constructor(
        private simulator: SparkAmpSimulator,
        private profile: SparkModelProfile,
        private options: SparkAmpBlePeripheralOptions
    ) {}

    private log(msg: string) {
        const logFn = this.options.logger ?? console.log;
        logFn(`[ble] ${msg}`);
    }

    private normalizeUuid(uuid: string): string {
        return uuid.toLowerCase().replace(/[^0-9a-f]/g, "");
    }

    private async loadBleno(): Promise<BlenoModule> {
        let bleno: BlenoModule | null = null;

        try {
            const req = require as NodeRequire;
            const mod = req("@stoprocent/bleno") as unknown;
            bleno = ((mod as { default?: unknown }).default ?? mod) as BlenoModule;
        } catch {
            bleno = null;
        }

        if (!bleno) {
            throw new Error(
                "BLE peripheral mode requires '@stoprocent/bleno'. Install it with: npm install --save-dev @stoprocent/bleno"
            );
        }

        return bleno;
    }

    private splitByFrameTerminator(input: Buffer): Buffer[] {
        const all = Buffer.concat([this.rxRemainder, input]);
        const frames: Buffer[] = [];

        let start = 0;
        for (let i = 0; i < all.length; i++) {
            if (all[i] === 0xf7) {
                frames.push(all.subarray(start, i + 1));
                start = i + 1;
            }
        }

        this.rxRemainder = all.subarray(start);
        return frames;
    }

    private sendBleNotifications(data: Uint8Array) {
        if (!this.notifyCallback) {
            return;
        }

        const maxLen = Math.max(1, this.maxNotifySize);
        for (let start = 0; start < data.length; start += maxLen) {
            const chunk = data.subarray(start, Math.min(start + maxLen, data.length));
            this.notifyCallback(Buffer.from(chunk));
        }
    }

    private handleWrite(data: Buffer) {
        const frames = this.splitByFrameTerminator(data);

        for (const frame of frames) {
            if (this.options.verbose) {
                this.log(`rx ${bytesToHex(frame)}`);
            }

            const parsed = parseSparkFrame(frame);
            if (!parsed) {
                this.log("Ignored non-protocol frame");
                continue;
            }

            const responses = this.simulator.handleMessage(parsed);
            for (const response of responses) {
                if (this.options.verbose) {
                    this.log(`tx ${bytesToHex(response)}`);
                }
                this.sendBleNotifications(response);
            }
        }
    }

    public async start(): Promise<void> {
        const bleno = await this.loadBleno();
        this.bleno = bleno;

        const commandUuid = this.normalizeUuid(this.profile.bleCommandCharacteristicUuid);
        const notifyUuid = this.normalizeUuid(this.profile.bleNotifyCharacteristicUuid);
        const serviceUuid = this.normalizeUuid(this.profile.bleServiceUuid);

        const commandCharacteristic = new bleno.Characteristic({
            uuid: commandUuid,
            properties: ["write", "writeWithoutResponse"],
            onWriteRequest: (
                data: Buffer,
                _offset: number,
                _withoutResponse: boolean,
                callback: (result: number) => void
            ) => {
                try {
                    this.handleWrite(data);
                    callback(0);
                } catch (err) {
                    this.log(`write handling failed: ${(err as Error).message}`);
                    callback(0x0e);
                }
            }
        });

        const notifyCharacteristic = new bleno.Characteristic({
            uuid: notifyUuid,
            properties: ["notify", "read"],
            onSubscribe: (maxValueSize: number, updateValueCallback: (data: Buffer) => void) => {
                this.maxNotifySize = maxValueSize;
                this.notifyCallback = updateValueCallback;
                this.log(`central subscribed notifications (max ${maxValueSize} bytes)`);
            },
            onUnsubscribe: () => {
                this.notifyCallback = null;
                this.log("central unsubscribed notifications");
            },
            onReadRequest: (_offset: number, callback: (result: number, data?: Buffer) => void) => {
                callback(0, Buffer.alloc(0));
            }
        });

        await new Promise<void>((resolve, reject) => {
            const onStateChange = (state: unknown) => {
                if (state !== "poweredOn") {
                    this.log(`adapter state ${String(state)} (waiting for poweredOn)`);
                    return;
                }

                bleno.removeListener("stateChange", onStateChange);

                bleno.startAdvertising(this.profile.bleName, [serviceUuid], (advertiseErr?: Error) => {
                    if (advertiseErr) {
                        reject(advertiseErr);
                        return;
                    }

                    const service = new bleno.PrimaryService({
                        uuid: serviceUuid,
                        characteristics: [commandCharacteristic, notifyCharacteristic]
                    });

                    bleno.setServices([service], (serviceErr?: Error) => {
                        if (serviceErr) {
                            reject(serviceErr);
                            return;
                        }

                        this.log(
                            `advertising '${this.profile.bleName}' service=${serviceUuid} cmd=${commandUuid} notify=${notifyUuid}`
                        );

                        resolve();
                    });
                });
            };

            bleno.on("stateChange", onStateChange);
            this.log("waiting for BLE adapter poweredOn state...");
        });
    }

    public async stop(): Promise<void> {
        if (!this.bleno) {
            return;
        }

        await new Promise<void>((resolve) => {
            this.bleno?.stopAdvertising(() => resolve());
        });

        this.notifyCallback = null;
        this.rxRemainder = Buffer.alloc(0);
        this.log("advertising stopped");
    }
}
