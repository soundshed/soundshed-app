
//
//
// Spark Message Class
//
// Class to package commands to send to Positive Grid Spark
//
// Based on https://github.com/paulhamsh/Spark-Parser
// Note: variable messages are sent using the msgpack structure

import { Preset } from "../../interfaces/preset";

var enc = new TextEncoder();

function bytes(val): Uint8Array {

    if (typeof (val) == 'string') {
        let b = enc.encode(val);
        return b;
    } else if (typeof (val) == 'number') {
        let b = Uint8Array.from([val]);
        return b;
    }
    else {
        let b = Uint8Array.from(val);
        return b;
    }

}

function buf2hex(buffer) { // buffer is an ArrayBuffer
    return Array.prototype.map.call(new Uint8Array(buffer), x => ('00' + x.toString(16)).slice(-2)).join('');
}

function len(val: string): number {
    return enc.encode(val).byteLength;
}

// Helper functions to package a command for the Spark (handles the 'format bytes')
export class SparkCommandMessage {

    private cmd: number;
    private sub_cmd: number;
    private multi: boolean;
    private data: Uint8Array;
    private split_data8: Array<Uint8Array> = [];
    private split_data7: Array<Uint8Array> = [];
    private final_message: Array<Uint8Array> = [];

    constructor() {
        this.data = Uint8Array.from([]);
        this.split_data8 = [];
        this.split_data7 = []
        this.cmd = 0;
        this.sub_cmd = 0;
    }

    start_message(cmd, sub_cmd, multi = false) {
        this.cmd = cmd
        this.sub_cmd = sub_cmd
        this.multi = multi
        this.data = Uint8Array.from([]);
        this.split_data8 = [];
        this.split_data7 = [];
        this.final_message = [];
    }

    buf2hex(b) {
        return buf2hex(b);
    }

    end_message() {

        // determine how many chunks there are

        let data_len = this.data.byteLength;

        let num_chunks = Math.floor((data_len + 0x7f) / 0x80);

        // split the data into chunks of maximum 0x80 bytes (still 8 bit bytes)
        // and add a chunk sub-header if a multi-chunk message
        for (let this_chunk = 0; this_chunk < num_chunks; this_chunk++) {
            let chunk_len = Math.min(0x80, data_len - (this_chunk * 0x80))

            let data8: Uint8Array = Uint8Array.from([]);

            if (num_chunks > 1) {
                // we need the chunk sub-header
                data8 = this.mergeBytes(Uint8Array.from([num_chunks]), Uint8Array.from([this_chunk]), Uint8Array.from([chunk_len]))
            }

            data8 = this.mergeBytes(data8, this.data.subarray(this_chunk * 0x80, this_chunk * 0x80 + chunk_len))

            this.split_data8.push(data8);
        }

        // now we can convert this to 7-bit data format with the 8-bits byte at the front
        // so loop over each chunk
        // and in each chunk loop over every sequence of (max) 7 bytes
        // and extract the 8th bit and put in 'bit8'
        // and then add bit8 and the 7-bit sequence to data7
        for (let chunk of this.split_data8) {

            let chunk_len = chunk.byteLength
            let num_seq = Math.floor(((chunk_len + 6) / 7))
            let bytes7 = Uint8Array.from([])

            for (let this_seq = 0; this_seq < num_seq; this_seq++) {
                let seq_len = Math.min(7, chunk_len - (this_seq * 7))
                let bit8 = 0
                let seq = Uint8Array.from([]);
                for (let ind = 0; ind < seq_len; ind++) {
                    let dat = chunk.subarray(this_seq * 7 + ind, this_seq * 7 + ind + 1)[0]
                    if ((dat & 0x80) == 0x80) {
                        bit8 |= (1 << ind)
                    }
                    dat &= 0x7f

                    seq = this.mergeBytes(seq, [dat]);

                }
                bytes7 = this.mergeBytes(bytes7, bytes(bit8), seq)
            }

            this.split_data7.push(bytes7)
        }



        // now we can create the final message with the message header and the chunk header
        let block_header = bytes([0x01, 0xfe, 0x00, 0x00, 0x53, 0xfe])
        let block_filler = bytes([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])
        let chunk_header = bytes([0xf0, 0x01, 0x3a, 0x15])

        for (let chunk of this.split_data7) {
            let block_size = chunk.byteLength + 16 + 6 + 1
            let header = this.mergeBytes(block_header, bytes(block_size), block_filler, chunk_header, bytes(this.cmd), bytes(this.sub_cmd))
            let trailer = bytes(0xf7)
            this.final_message.push(this.mergeBytes(header, chunk, trailer))
        }
        return this.final_message

    }
    // // // // // // // //  Helper functions for packing data types

    add_bytes(b: Uint8Array) {
        this.data = this.mergeBytes(this.data, b);
    }

    add_prefixed_string(pack_str) {
        this.add_bytes(bytes(len(pack_str)))
        this.add_bytes(this.mergeBytes(bytes(len(pack_str) + 0xa0), bytes(pack_str)))
    }

    add_string(pack_str) {
        this.add_bytes(this.mergeBytes(bytes(len(pack_str) + 0xa0), bytes(pack_str)))
    }

    add_long_string(pack_str) {
        this.add_bytes(bytes(0xd9))
        this.add_bytes(this.mergeBytes(bytes(len(pack_str)), bytes(pack_str)))
    }

    add_float(flt) {
        // float is a prefix of 0xCA with four bytes for float value (packed C struct), convert to js Float32 then reverse bytes

        let floatArray = new Float32Array(1);
        floatArray[0] = flt;

        this.add_bytes(bytes(0xca))

        var floatBytes = new Uint8Array(floatArray.buffer).reverse();
        this.add_bytes(floatBytes)
    }

    add_onoff(onoff: string | boolean) {
        let b: Uint8Array;
        if (onoff == "On" || onoff == true) {
            b = bytes(0xc3)
        }
        else {
            b = bytes(0xc2)
        }
        this.add_bytes(b)
    }

    // Functions to package a command for the Spark

    request_preset_state() {
        const cmd = 0x02; // get
        const sub_cmd = 0x01 // preset

        this.start_message(cmd, sub_cmd)

        this.add_bytes(bytes(1))

        return this.end_message()
    }

    request_info(sub_cmd) {
        const cmd = 0x02; // get

        this.start_message(cmd, sub_cmd)

        this.add_bytes(bytes(0))

        return this.end_message()
    }


    change_effect_parameter(pedal, param, val) {
        const cmd = 0x01
        const sub_cmd = 0x04

        this.start_message(cmd, sub_cmd)
        this.add_prefixed_string(pedal)
        this.add_bytes(bytes(param))
        this.add_float(val)
        return this.end_message()
    }

    change_amp_parameter(dspId: string, paramNumber: number, val:number) {
        const cmd = 0x03
        const sub_cmd = 0x37

        this.start_message(cmd, sub_cmd)
        this.add_prefixed_string(dspId)
        this.add_bytes(bytes(paramNumber))
        this.add_float(val)
        return this.end_message()
    }

    change_effect(pedal1, pedal2) {
        const cmd = 0x01
        const sub_cmd = 0x06

        this.start_message(cmd, sub_cmd)
        this.add_prefixed_string(pedal1)
        this.add_prefixed_string(pedal2)
        return this.end_message()
    }

    change_amp(dspIdOld, dspIdNew) {
        const cmd = 0x03
        const sub_cmd = 0x06

        this.start_message(cmd, sub_cmd)
        this.add_prefixed_string(dspIdOld)
        this.add_prefixed_string(dspIdNew)
        return this.end_message()
    }

    change_hardware_preset(preset_num) {
        //  preset_num is 0 to 3
        const cmd = 0x01
        const sub_cmd = 0x38

        this.start_message(cmd, sub_cmd)
        this.add_bytes(bytes(0))
        this.add_bytes(bytes(preset_num))
        return this.end_message()
    }

    store_current_preset(preset_num) {
        //  preset_num is 0 to 3
        const cmd = 0x03
        const sub_cmd = 0x27

        this.start_message(cmd, sub_cmd)
        this.add_bytes(bytes(0))
        this.add_bytes(bytes(preset_num))
        return this.end_message()
    }

    turn_effect_onoff(pedal, onoff) {
        const cmd = 0x01
        const sub_cmd = 0x15

        this.start_message(cmd, sub_cmd)
        this.add_prefixed_string(pedal)
        this.add_onoff(onoff)
        return this.end_message()
    }

    create_preset(preset) {

        const cmd = 0x01
        const sub_cmd = 0x01

        this.start_message(cmd, sub_cmd, true)

        this.add_bytes(bytes([0x00, 0x7f]))
        this.add_long_string(preset["UUID"])
        this.add_string(preset["Name"])
        this.add_string(preset["Version"])

        let descr = preset["Description"]
        if (descr.length > 31) {
            this.add_long_string(descr)
        }
        else {
            this.add_string(descr)
        }

        this.add_string(preset["Icon"])
        this.add_float(120.0) // preset["BPM"]
        this.add_bytes(bytes(0x90 + 7))        //  always 7 pedals

        for (let i = 0; i < 7; i++) {
            this.add_string(preset["Pedals"][i]["Name"])
            this.add_onoff(preset["Pedals"][i]["OnOff"])
            let num_p = preset["Pedals"][i]["Parameters"].length;
            this.add_bytes(bytes(num_p + 0x90))
            for (let p = 0; p < num_p; p++) {
                this.add_bytes(bytes(p))
                this.add_bytes(bytes(0x91))
                this.add_float(preset["Pedals"][i]["Parameters"][p])
            }
        }

        this.add_bytes(bytes(preset["End Filler"]))

        return this.end_message()
    }

    create_preset_from_model(preset: Preset) {

        const cmd = 0x01
        const sub_cmd = 0x01

        this.start_message(cmd, sub_cmd, true)

        this.add_bytes(bytes([0x00, 0x7f]))
        this.add_long_string(preset.meta.id)
        this.add_string(preset.meta.name)
        this.add_string(preset.meta.version)

        let descr = preset.meta.description;

        if (descr.length > 31) {
            this.add_long_string(descr)
        }
        else {
            this.add_string(descr)
        }

        this.add_string(preset.meta.icon)
        this.add_float(preset.bpm)
        this.add_bytes(bytes(0x90 + 7))        //  always 7 pedals

        for (let i = 0; i < 7; i++) {
            let fx = preset.sigpath[i];
            this.add_string(fx.dspId)
            this.add_onoff(fx.active)
            let num_p = fx.params.length;
            this.add_bytes(bytes(num_p + 0x90))
            for (let p = 0; p < num_p; p++) {
                this.add_bytes(bytes(p));
                this.add_bytes(bytes(0x91));
                this.add_float(fx.params[p].value);
            }
        }

        //??
        this.add_bytes(bytes(0))

        return this.end_message()
    }

    // utils

    mergeTypedArrays(type, arrays) {
        // https://2ality.com/2015/10/concatenating-typed-arrays.html
        let totalLength = 0;
        for (let al of arrays) {
            totalLength += al.length;
        }

        let result = new type(totalLength);
        let offset = 0;

        for (let ar of arrays) {
            result.set(ar, offset);
            offset += ar.length;
        }
        return result;
    }

    mergeBytes(...arrays): Uint8Array {
        return this.mergeTypedArrays(Uint8Array, arrays);
    }
}
