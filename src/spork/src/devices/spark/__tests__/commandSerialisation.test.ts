import { beforeEach, describe, expect, it } from "vitest";
import { BluetoothDeviceInfo } from "../../../interfaces/deviceController";
import { SerialCommsProvider } from "../../../interfaces/serialCommsProvider";
import { SparkDeviceManager } from "../sparkDeviceManager";
import { blocksToChunks, buildTestPreset } from "./protocolTestUtils";

/**
 * Records the exact interleaving of writes and ack waits so a test can assert that
 * a multi-chunk preset upload is never split by another command.
 */
class TracingConnection implements SerialCommsProvider {
  public events: string[] = [];
  public written: Uint8Array[] = [];
  public spark2 = true;
  public onDisconnected: (() => void) | null = null;

  /** Resolves each ack after a turn of the microtask queue, mimicking a real wait. */
  public ackDelayMs = 0;

  async disconnect(): Promise<void> {}

  async connect(_device: BluetoothDeviceInfo): Promise<boolean> {
    return true;
  }

  async scanForDevices(): Promise<any> {
    return [];
  }

  async beginQueuedReceive(): Promise<boolean> {
    return true;
  }

  readReceiveQueue(): Array<Uint8Array> {
    return null;
  }

  peekReceiveQueueEnd(): Uint8Array {
    return null;
  }

  async write(buffer): Promise<void> {
    const bytes = new Uint8Array(buffer);
    this.written.push(bytes);
    // chunk[4] is the command byte; enough to tell a preset block from a query.
    this.events.push("write:" + this.describe(bytes));
  }

  async waitForAck(_cmd: number | number[], _subCmd: number): Promise<boolean> {
    this.events.push("ack");
    await new Promise((r) => setTimeout(r, this.ackDelayMs));
    return true;
  }

  isSpark2Connection(): boolean {
    return this.spark2;
  }

  async reconnect(): Promise<boolean> {
    return true;
  }

  private describe(bytes: Uint8Array): string {
    const chunk = blocksToChunks([bytes])[0];
    return `cmd${chunk[4].toString(16)}sub${chunk[5].toString(16)}`;
  }
}

const SPARK_2: BluetoothDeviceInfo = { name: "Spark 2 Audio", address: "b", port: null };

let connection: TracingConnection;
let manager: SparkDeviceManager;

beforeEach(async () => {
  connection = new TracingConnection();
  manager = new SparkDeviceManager(connection);
  await manager.connect(SPARK_2);
});

describe("command serialisation", () => {
  it("never interleaves another command with a multi-chunk preset upload", async () => {
    const upload = manager.sendCommand("set_preset", buildTestPreset());

    // Fired while the upload is mid-flight, exactly like the tone chooser's
    // follow-up query used to be. It must be queued, not injected between chunks.
    const query = manager.sendCommand("get_preset", 0x7f);

    await Promise.all([upload, query]);

    const events = connection.events;

    // The upload writes one block then waits for its ack, repeatedly. The query is
    // a single trailing write. Any interleaving shows up as two writes in a row
    // before the upload has finished acking.
    const uploadEvents = events.slice(0, events.length - 1);

    expect(uploadEvents.length).toBeGreaterThan(2);
    uploadEvents.forEach((event, index) => {
      expect(event.startsWith(index % 2 === 0 ? "write:" : "ack")).toBe(true);
    });

    expect(events[events.length - 1].startsWith("write:")).toBe(true);
  });

  it("runs commands in the order they were requested", async () => {
    const order: string[] = [];

    const a = manager.sendCommand("set_channel", 1).then(() => order.push("a"));
    const b = manager.sendCommand("set_channel", 2).then(() => order.push("b"));
    const c = manager.sendCommand("set_channel", 3).then(() => order.push("c"));

    await Promise.all([a, b, c]);

    expect(order).toEqual(["a", "b", "c"]);
  });

  it("still runs a queued command after the one ahead of it fails", async () => {
    const chain = new TracingConnection();
    const mgr = new SparkDeviceManager(chain);
    await mgr.connect(SPARK_2);

    let calls = 0;
    chain.write = async () => {
      calls++;
      if (calls === 1) throw new Error("first fails");
    };

    const first = mgr.sendCommand("set_channel", 1).catch(() => "failed");
    const second = mgr.sendCommand("set_channel", 2);

    await first;
    await second;

    // A rejected command must not leave the queue permanently blocked.
    expect(calls).toBe(2);
  });
});
