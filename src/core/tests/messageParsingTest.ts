import { json } from "react-router-dom";
import { BleProvider } from "../../spork/src/devices/spark/bleProvider";
import { SparkDeviceManager } from "../../spork/src/devices/spark/sparkDeviceManager";

export class MessageParsingTest {

    async Test1() {

        // Spark 40 Example
        let data = [
            "01fe000041ff6a000000000000000000f0013a640301200f001900015924004533394545313600412d444531302d00343634362d3832f7f0013a590301000f011935372d360037393137423630103842363228322d404372756e636823f7f0013a4d0301400f0219302e",
            "01fe000041ff6a000000000000000000372800322d4372756e6302682869636f6e2e28706e674a427000f7f0013a4a0301300f031900172e62006961732e6e6f6940736567617465436d1300114a3d6d7ef7f0013a5e0301680f04192501114a603d782c7802114a1000",
            "01fe000041ff6a0000000000000000000000002a436f006d70726573736ff7f0013a3a0301300f0519724312000b114a3e1b172c0173114a3f0578712d00446973746f7274f7f0013a790301000f0619696f6e546c5339421400114a643e06106a01114a623e05341602",
            "01fe000041ff6a000000000000000000114af7f0013a5d0301500f07193e771f3b0603114a000000000128414320426f6f6c7374431500114af7f0013a1e0301200f08193f0f5e261601114a3e7a586c1602114a3e1a177c7603114a3e502b3ff7f0013a260301300f09",
            "01fe000041ff6a0000000000000000001904114a3e0d322e0a27466c61306e6765724213003b114a3e535c3001f7f0013a210301180f0a19114a3f29193d3802114a3f270539612944656c6160794d6f6e6f4215f7f0013a4e0301300f0b1900114a3d313e3c3e01114a",
            "01fe000041ff6a0000000000000000003e3429237702114a3f3402637103114a3ff7f0013a770301300f0c1919191a044b114a3f0000002b00626961732e72653076657262431700f7f0013a330301180f0d19114a3e4b19072901114a3f651b410302114a3f1b19001e",
            "01fe000041ff3c00000000000000000003114a3e6cf7f0013a5a0301500f0e183e590411414a3f1507500511414a3f2666670611394a3e4c4c4d07f7"
        ];

        var dev = new SparkDeviceManager(null);
        let devBytes = new Array<Uint8Array>();
        for (let hex of data) {
            devBytes.push(dev.hexToUint8Array(hex));
        }

        let msgs = await dev.readStateMessage(devBytes);
        console.log(msgs);
    }


    async Test2() {

        // Spark 40 Example
        let data = [
            "01fe000041ff6a000000000000000000f0013a640301200f001900015924004533394545313600412d444531302d00343634362d3832f7f0013a590301000f011935372d360037393137423630103842363228322d404372756e636823f7f0013a4d0301400f0219302e",
            "01fe000041ff6a000000000000000000372800322d4372756e6302682869636f6e2e28706e674a427000f7f0013a4a0301300f031900172e62006961732e6e6f6940736567617465436d1300114a3d6d7ef7f0013a5e0301680f04192501114a603d782c7802114a1000",
            "01fe000041ff6a0000000000000000000000002a436f006d70726573736ff7f0013a3a0301300f0519724312000b114a3e1b172c0173114a3f0578712d00446973746f7274f7f0013a790301000f0619696f6e546c5339421400114a643e06106a01114a623e05341602",
            "01fe000041ff6a000000000000000000114af7f0013a5d0301500f07193e771f3b0603114a000000000128414320426f6f6c7374431500114af7f0013a1e0301200f08193f0f5e261601114a3e7a586c1602114a3e1a177c7603114a3e502b3ff7f0013a260301300f09",
            "01fe000041ff6a0000000000000000001904114a3e0d322e0a27466c61306e6765724213003b114a3e535c3001f7f0013a210301180f0a19114a3f29193d3802114a3f270539612944656c6160794d6f6e6f4215f7f0013a4e0301300f0b1900114a3d313e3c3e01114a",
            "01fe000041ff6a0000000000000000003e3429237702114a3f3402637103114a3ff7f0013a770301300f0c1919191a044b114a3f0000002b00626961732e72653076657262431700f7f0013a330301180f0d19114a3e4b19072901114a3f651b410302114a3f1b19001e",
            "01fe000041ff6a00000000000000000003114a3e6cf7f0013a5a0301500f0e183e590411414a3f1507500511414a3f2666670611394a3e4c4c4d07f7f0013a640301200f001900015924004533394545313600412d444531302d00343634362d3832f7f0013a59030100",
            "01fe000041ff6a0000000000000000000f011935372d360037393137423630103842363228322d404372756e636823f7f0013a4d0301400f0219302e372800322d4372756e6302682869636f6e2e28706e674a427000f7f0013a4a0301300f031900172e62006961732e"
        ]


        var dev = new SparkDeviceManager(null);
        let devBytes = new Array<Uint8Array>();
        for (let hex of data) {
            devBytes.push(dev.hexToUint8Array(hex));
        }

        let msgs = await dev.readStateMessage(devBytes);
        console.log(msgs);
    }

    async Test4() {

        // Spark Mini Example, possibly garbled
        let data = [
            "f0013a120301200f001900005924003631463032",
            "464500392d444637382d00343142342d4231f7f0",
            "013a470301000f011941362d4300453646373345",
            "331035313536265248105954484d23302ef7f001",
            "3a550301300f02193720",
            "286900636f6e2e706e67654a42700000172e0062",
            "6961732e6e6ff7f0013a390301000f0319697365",
            "6758617465421300115d4a3d756e4301114d4a3e",
            "292f120211f7f0013a340301080f04194a000000",
            "02002a436f6d70726065",
            "73736f7243127600114a3e7e3b10f7f0013a2003",
            "01300f051901114a3f0874000027426f6f307374",
            "657242130003114a3f0f1f7801f7f0013a0b0301",
            "180f0619114a000018000002114a000004000024",
            "5477696e1b431500114a",
            "3f34f7f0013a6e0301500f07194f4a0111454a3e",
            "3e51660211594a3f0360640311494a3f2b785204",
            "11f7f0013a5b0301680f08194a3e3138020f2c43",
            "686f72750073416e616c6f671b421400114a3f42",
            "f7f0013a750301480f09",
            "1966250111554a3e0f2f3a0211494a3f3e6a4e03",
            "11214a3f115b1d2a44f7f0013a350301000f0a19",
            "656c617960526532303143152600114a3e636716",
            "1601114a3e1b2012f7f0013a4c0301300f0b1902",
            "114a3e3107556c03114a",
            "3e3139551a04114a3f090000002b626961f7f001",
            "3a070301000f0c19732e72653076657262431700",
            "03114a3f010761013b114a3e46745f02f7f0013a",
            "0d0301580f0d19114a3e601b173203114a3f315b",
            "162004114a3e795b797a",
            "05114a3e6ef7f0013a420301480f0e0a4a380611",
            "1d4a3e19191a17f7f0013a120301200f00190000",
            "5924003631463032464500392d444637382d0034",
            "3142342d4231f7f0013a470301000f011941362d"
        ]


        var dev = new SparkDeviceManager(null);
        let devBytes = new Array<Uint8Array>();
        for (let hex of data) {
            devBytes.push(dev.hexToUint8Array(hex));
        }

        let msgs = await dev.readStateMessage(devBytes);
        console.log(msgs);

        //split data on f7
        // get all bytes into single stream
        let allBytes = [];
        devBytes.forEach(element => {
            element.forEach(d => {
                allBytes.push(d);
            });
        });

        // split stream into rows on f7
        let allRows = new Array<Uint8Array>();
        let currentRow = [];
        for (let d of allBytes) {
            currentRow.push(d);

            if (d == 0xf7) {
                allRows.push(new Uint8Array(currentRow));
                currentRow = [];
            }

        }
        if (currentRow.length > 0) allRows.push(new Uint8Array(currentRow));

        console.log("Rows split by f7:");
        for (let c of allRows) {

            console.log(`MSG:${c[2]} IDX: ${c[8]} of ${c[7]} \t${this.buf2hex(c)}`);
        }

        msgs = await dev.readStateMessage(allRows);
        console.log(msgs);
    }

    buf2hex(buffer) { // buffer is an ArrayBuffer
        return Array.prototype.map.call(new Uint8Array(buffer), x => ('00' + x.toString(16)).slice(-2)).join('');
    }

    async Test3() {

        // Spark mini response stream
        let data = [
            "f0013a010310000001f7",
            "f0013a2803012010001900015924003736313562",
            "353200632d633233622d00343563322d6261f7f0",
            "013a2c03010010011937652d3900613162393235",
            "6210333433302643551053544f4d23302ef7f001",
            "3a4a0301301002193720",
            "286900636f6e2e706e67654a42700000172e0062",
            "6961732e6e6ff7f0013a21030100100319697365",
            "6758617465421300114d4a3e0b72130111414a00",
            "0000000211f7f0013a160301281004194a3f0000",
            "02002a436f6d70726065",
            "73736f7243122600114a3f15093af7f0013a2103",
            "013010051901114a3e0b3667052d44697300746f",
            "7274696f6e5854533943140011f7f0013a0c0301",
            "281006194a3f00002c0001114a3e1c010c6c0211",
            "4a3f02620c3903114a00",
            "0000f7f0013a5b03011010071900295265006374",
            "69666965725b431500114a3f0058000001114a3e",
            "68f7f0013a740301581008193b3a0211554a3e20",
            "4e250311414a3f1b1a0c0411394a3f33552f2947",
            "f7f0013a0c0301001009",
            "1975697461307245513643170003114a3f000000",
            "0103114a3f04033502f7f0013a1b030118100a19",
            "114a3f071a387b03114a3f1418100d04114a3f1b",
            "18490705114a3f00f7f0013a5b030140100b1900",
            "000611214a3f00000029",
            "4400656c61794d6f6e366f431500114a3ef7f001",
            "3a55030108100c193e0247013b114a3e10686c02",
            "2b114a3e5f04350333114a3f19191a04f7f0013a",
            "2c030118100d19114a00000400002b6269617300",
            "2e7265766572621b4317",
            "00114a3f4cf7f0013a33030158100e194c4d0111",
            "454a3d715f160211494a3f2412490311514a3f2a",
            "0e200411f7f0013a36030128100f144a3e12490c",
            "2505114a3e715f4c1706114a3f4c4c014d28f7f0",
            "013a2803012010001900",
            "015924003736313562353200632d633233622d00",
            "343563322d6261f7f0013a2c0301001001193765",
            "2d39006131623932356210333433302643551053",
            "544f4d23302ef7f0013a4a030130100219372028",
            "6900636f6e2e706e6765",
            "4a42700000172e00626961732e6e6ff7f0013a21",
            "0301001003196973656758617465421300114d4a",
            "3e0b72130111414a000000000211f7f0013a1603",
            "01281004194a3f000002002a436f6d7072606573",
            "736f7243122600114a3f",
            "15093af7f0013a2103013010051901114a3e0b36",
            "67052d44697300746f7274696f6e585453394314",
            "0011f7f0013a0c0301281006194a3f00002c0001",
            "114a3e1c010c6c02114a3f02620c3903114a0000",
            "00f7f0013a5b03011010",
            "07190029526500637469666965725b431500114a",
            "3f0058000001114a3e68f7f0013a740301581008",
            "193b3a0211554a3e204e250311414a3f1b1a0c04",
            "11394a3f33552f2947f7f0013a0c030100100919",
            "75697461307245513643",
            "170003114a3f0000000103114a3f04033502f7f0",
            "013a1b030118100a19114a3f071a387b03114a3f",
            "1418100d04114a3f1b18490705114a3f00f7f001",
            "3a5b030140100b1900000611214a3f0000002944",
            "00656c61794d6f6e366f"
        ];

        var dev = new SparkDeviceManager(null);
        let devBytes = new Array<Uint8Array>();
        for (let hex of data) {
            devBytes.push(dev.hexToUint8Array(hex));
        }

        let msgs = await dev.readStateMessage(devBytes);

        console.debug("Raw Interpreted Messages:")
        console.debug(msgs);

        console.debug("Performing Multipart parsing of data into queue:")
        // test message queuing with split on terminator
        var serial = new BleProvider();

        for (let dat of devBytes) {
            serial.handleAndQueueMessageData(dat);
        }

        let q = serial.readReceiveQueue();

        console.debug("Full Message Queue:")
        for (let item of q) {
            console.debug(serial.buf2hex(item));
        }
        msgs = await dev.readStateMessage(q);

        console.debug("Full Queue Interpreted Messages:")
        console.debug(msgs);

        ////////////// read data into message queue in two batches, unconsumed data should remain in queue for next batch
        console.debug("Preforming multi-stage queue parsing")
        serial = new BleProvider();

        for (let dat of devBytes.slice(0, 9)) {
            serial.handleAndQueueMessageData(dat);
        }

        let totalMultiStageMsgs = 0;

        // process first section of data rows
        q = serial.readReceiveQueue();
        console.debug("Part 1 of Message Queue: " + q.length)

        for (let item of q) {
            console.debug(serial.buf2hex(item));
        }
        msgs = await dev.readStateMessage(q);
        console.debug(msgs);
        totalMultiStageMsgs += msgs.length;

        // process next section of data rows
        for (let dat of devBytes.slice(9)) {
            serial.handleAndQueueMessageData(dat);
        }
        let q2 = serial.readReceiveQueue();
        console.debug("Part 2 of Message Queue:" + q2.length)
        for (let item of q2) {
            console.debug(serial.buf2hex(item));
        }

        msgs = await dev.readStateMessage(q2);
        console.debug(msgs);
        totalMultiStageMsgs += msgs.length;

        // process joined data rows with new reader
        dev = new SparkDeviceManager(null);
        let joined = q.concat(q2);
        console.debug("Multi-Stage Message Queue: " + joined.length)
        for (let item of joined) {
            console.debug(serial.buf2hex(item));
        }
        for (let item of joined) {
            console.debug(serial.buf2hex(item));
        }
        console.debug("Multi Interpreted Messages:")
        msgs = await dev.readStateMessage(joined);
        console.debug(msgs);

        if (totalMultiStageMsgs != msgs.length) {
            throw (`Multi stage reading ${totalMultiStageMsgs} does not match full batch reading ${msgs.length}`);
        }
    }

    async Test() {
        return await this.Test4();
    }
}
