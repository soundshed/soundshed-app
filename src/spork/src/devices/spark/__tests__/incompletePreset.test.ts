import { describe, it, expect } from "vitest";
import { BleProvider } from "../bleProvider";
import { SparkMessageReader } from "../sparkMessageReader";

// A preset as a Spark Mini sent it over Web Bluetooth, one entry per notification. The amp sends
// 90-byte blocks as notifications of 20, 20, 20, 20 and 10 bytes; sometimes a whole block never arrives.
const SPARK_MINI = [
    "f0013a7303012011001900035924004236453241",
    "373800392d313038372d00343646362d4141f7f0",
    "013a4803010011011938462d3400394635303544",
    "451043394438284163406f757374696323f7f001",
    "3a1e030140110219302e",
    "37590021446573637269007074696f6e2066006f",
    "722041636f75f7f0013a4a030100110319737469",
    "6300205072657365740420312869636f6e502e70",
    "6e674a4270f7f0013a710301601104190000172e",
    "00626961732e6e6f0069",
    "7365676174651b431200114a3f54f7f0013a7a03",
    "014011051947240111254a3f0000002e42004245",
    "4f7074696340616c436f6d7042f7f0013a1e0301",
    "681106191300114a683f421d3c01114a6a3e0460",
    "2702114a10000000002d",
    "4469f7f0013a7503010011071973746f72007469",
    "6f6e5453391b421300114a3e0e596c6201114a3e",
    "50f7f0013a5b03015811081907210211394a3f30",
    "1944284100636f75737469631b431500114a3f23",
    "f7f0013a1e0301481109",
    "194b750111514a3f4c297a0211514a3f1a374703",
    "11494a3f322b3d0411f7f0013a16030148110a19",
    "4a3f5955026f2c43686f72750073416e616c6f67",
    "1b421400114a3f57f7f0013a4b030140110b1978",
    "6e0111494a3e68795e02",
    "11494a3f6f1a3503113d4a3e335a4c2944f7f001",
    "3a3d030100110c19656c6179304d6f6e6f421500",
    "03114a3e65601d0123114a3e58414e02f7f0013a",
    "76030158110d19114a3e7b1a5b0403114a3f195b",
    "191a04114a3f00040000",
    "2b62696173f7f0013a75030100110e192e726576",
    "5865726242170011514a3f390a2f01115d4a3e26",
    "7f1e0211f7f0013a5c030128110f194a3e0d326d",
    "1003114a3e382f2d0c04114a3e30196c7105114a",
    "3e7858f7f0013a060301",
    "601110133f06114a1e3e4c4c4d4a461c0418004a",
    "3f0000000002f7",
];

// A preset from a Spark 40: one 106-byte block per notification, each behind a 16-byte header
// (the capture in src/core/tests/messageParsingTest.ts).
const SPARK_40 = [
    "01fe000041ff6a000000000000000000f0013a640301200f001900015924004533394545313600412d444531302d00343634362d3832f7f0013a590301000f011935372d360037393137423630103842363228322d404372756e636823f7f0013a4d0301400f0219302e",
    "01fe000041ff6a000000000000000000372800322d4372756e6302682869636f6e2e28706e674a427000f7f0013a4a0301300f031900172e62006961732e6e6f6940736567617465436d1300114a3d6d7ef7f0013a5e0301680f04192501114a603d782c7802114a1000",
    "01fe000041ff6a0000000000000000000000002a436f006d70726573736ff7f0013a3a0301300f0519724312000b114a3e1b172c0173114a3f0578712d00446973746f7274f7f0013a790301000f0619696f6e546c5339421400114a643e06106a01114a623e05341602",
    "01fe000041ff6a000000000000000000114af7f0013a5d0301500f07193e771f3b0603114a000000000128414320426f6f6c7374431500114af7f0013a1e0301200f08193f0f5e261601114a3e7a586c1602114a3e1a177c7603114a3e502b3ff7f0013a260301300f09",
    "01fe000041ff6a0000000000000000001904114a3e0d322e0a27466c61306e6765724213003b114a3e535c3001f7f0013a210301180f0a19114a3f29193d3802114a3f270539612944656c6160794d6f6e6f4215f7f0013a4e0301300f0b1900114a3d313e3c3e01114a",
    "01fe000041ff6a0000000000000000003e3429237702114a3f3402637103114a3ff7f0013a770301300f0c1919191a044b114a3f0000002b00626961732e72653076657262431700f7f0013a330301180f0d19114a3e4b19072901114a3f651b410302114a3f1b19001e",
    "01fe000041ff3c00000000000000000003114a3e6cf7f0013a5a0301500f0e183e590411414a3f1507500511414a3f2666670611394a3e4c4c4d07f7",
];

const hex = (s: string) => Uint8Array.from(s.match(/../g).map((b) => parseInt(b, 16)));

function receive(provider: any, notifications: string[]): Uint8Array[] {
    for (const n of notifications) provider.handleAndQueueMessageData(hex(n));
    provider.lastMsgReceivedTime = new Date(0); // skip the quiet period before a batch is released
    return provider.readReceiveQueue() ?? [];
}

function parse(chunks: Uint8Array[]) {
    const reader = new SparkMessageReader();
    reader.set_message(chunks);
    reader.read_message();
    return { types: reader.readMessageQueue().map((m) => m.type), incomplete: reader.incompleteMessage };
}

const without = (notifications: string[], from: number, count: number) =>
    notifications.filter((_, i) => i < from || i >= from + count);

describe.each([
    ["Spark Mini", SPARK_MINI, 5],
    ["Spark 40", SPARK_40, 1],
])("a preset reply from a %s", (_, reply, notificationsPerBlock) => {
    it("is read when it arrives whole", () => {
        expect(parse(receive(new BleProvider(), reply))).toEqual({ types: ["preset"], incomplete: false });
    });

    it("is reported, not shown half-read, when a block never arrives", () => {
        for (let from = 0; from < reply.length; from += notificationsPerBlock) {
            const result = parse(receive(new BleProvider(), without(reply, from, notificationsPerBlock)));

            expect(result.types, `block at ${from}`).not.toContain("preset");
            expect(result.incomplete, `block at ${from}`).toBe(true);
        }
    });

    it("does not spoil the next reply after losing its end", () => {
        const provider = new BleProvider();
        receive(provider, reply.slice(0, -1));

        expect(parse(receive(provider, reply))).toEqual({ types: ["preset"], incomplete: false });
    });
});

describe("a Spark Mini preset reply", () => {
    it("is reported when any single notification never arrives", () => {
        for (let i = 0; i < SPARK_MINI.length; i++) {
            const result = parse(receive(new BleProvider(), without(SPARK_MINI, i, 1)));

            expect(result.types, `notification ${i}`).not.toContain("preset");
            expect(result.incomplete, `notification ${i}`).toBe(true);
        }
    });

    it("drops its end if that turns up late", () => {
        const provider = new BleProvider();
        receive(provider, SPARK_MINI.slice(0, -2));

        expect(parse(receive(provider, SPARK_MINI.slice(-2))).types).toEqual([]);
    });

    it("reports a tiny chunk glued together from two others instead of throwing", () => {
        // the 2nd notification ends in f7 f0, and the next one to arrive ends a chunk 4 bytes in
        const result = parse(receive(new BleProvider(), [SPARK_MINI[0], SPARK_MINI[1], SPARK_MINI[34]]));

        expect(result.incomplete).toBe(true);
    });
});
