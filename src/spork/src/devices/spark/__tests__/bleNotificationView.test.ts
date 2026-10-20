import { describe, it, expect } from "vitest";
import { BleProvider } from "../bleProvider";

// A BLE notification delivers its bytes as a DataView. A DataView can be a window
// onto a larger buffer, and wrapping `dataView.buffer` on its own reads the whole
// buffer, including bytes that are not part of this notification.
//
// Current browsers usually hand over a buffer containing only the notification, so
// this never showed up in practice, but nothing guarantees that.

function receive(provider: any, dataView: DataView): Uint8Array {
    let received: Uint8Array | null = null;
    provider.handleAndQueueMessageData = (chunk: Uint8Array) => { received = chunk; };
    provider.handleCharacteristicValueChanged({ target: { value: dataView }, timeStamp: 0 } as any);
    return received!;
}

describe("reading a BLE notification", () => {
    it("reads only the bytes inside the DataView's window", () => {
        const provider: any = new BleProvider();
        const shared = new Uint8Array([0xaa, 0xbb, 0x01, 0xfe, 0xf7, 0xcc, 0xdd]);

        const received = receive(provider, new DataView(shared.buffer, 2, 3));

        expect(Array.from(received)).toEqual([0x01, 0xfe, 0xf7]);
    });

    it("reads the whole buffer when the view spans all of it", () => {
        const provider: any = new BleProvider();
        const bytes = new Uint8Array([0x01, 0xfe, 0x00, 0xf7]);

        const received = receive(provider, new DataView(bytes.buffer));

        expect(Array.from(received)).toEqual([0x01, 0xfe, 0x00, 0xf7]);
    });
});
