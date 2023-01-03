// port of https://github.com/paulhamsh/Spark-Parser/blob/main/SparkClassNew/SparkReaderClass.py

import { BpmMessage, DeviceMessage, DeviceState, FxChangeMessage, FxParam, FxParamMessage, FxToggleMessage, Preset, PresetChangeMessage, SignalPath } from "../../interfaces/preset";

//
//Spark Class
//
//Class to read commands sent to Positive Grid Spark
//
//See https://github.com/paulhamsh/Spark-Parser

//Use:  reader = SparkReadMessage()
//      reader.set_message(preset)
//      reader.read_message()
//
//      reader.text is a text representation
//      reader.raw is a raw unformatted text representation
//      reader.python is a python dict representation
//
//      reader.data is the input bytes
//      reader.message is the 8 bit data in the message


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

function len(val): number {
    if (typeof (val) == 'string') {
        return enc.encode(val).byteLength;
    } else {
        return val.byteLength;
    }
}

function buf2hex(buffer) { // buffer is an ArrayBuffer
    return Array.prototype.map.call(new Uint8Array(buffer), x => ('00' + x.toString(16)).slice(-2)).join('');
}

function hex(val): string {
    try {
        return buf2hex(val);
    } catch {
        return val + "";
    }
}

function chr(val): string {
    return String.fromCharCode(val);
}

export class SparkMessageReader {
    private data: Array<Uint8Array>;
    private message: Array<Uint8Array>;
    private msg: Uint8Array;
    private msg_pos;
    private cmd;
    private sub_cmd;
    public raw = "";
    public text = "";
    public python = "";
    private indent = "";

    public deviceState: DeviceState = {};
    public receivedMessageQueue:DeviceMessage[] = [];

    constructor() {
        this.data = [];
        this.message = []
        this.deviceState = {};
    }

    set_message(msgArray) {
        this.data = msgArray;
        this.message = []
    }

    static mergeBytes(...arrays): Uint8Array {
        return SparkMessageReader.mergeTypedArrays(Uint8Array, arrays);
    }

    static mergeTypedArrays(type, arrays) {
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

    structure_data() {
        this.cmd = 0
        this.sub_cmd = 0
        let block_content = bytes([]);

        //remove all the block headers and concatenate the contents
        //no point in retaining the block structure as chunks can span blocks
        //in messages received from Spark

        /* Sorry - skipping this makes this code Mini-specific, but I couldn't get it to work otherwise*/
        for (let block of this.data) {
            let chunkoffset = 0;
            if ((block[0] == 0x01) && (block[1] == 0xfe)) {
                let block_length = block[6]
                if (len(block) != block_length) {
                    this.log(`Block is length ${len(block)} and reports ${block_length}`)
                }
                chunkoffset = 16;
            }
            let chunk = block.subarray(chunkoffset);
            block_content = SparkMessageReader.mergeBytes(block_content, chunk);
        }
        //and split them into chunks now, splitting on each f7

        let chunk_temp = bytes([])
        let chunks: Array<Uint8Array> = []

        block_content.forEach(by => {
            chunk_temp = SparkMessageReader.mergeBytes(chunk_temp, bytes(by));

            if (by == 0xf7) {
                chunks.push(chunk_temp)
                chunk_temp = bytes([])
            }

        })


        //remove the chunk headers, saving the command and sub_command
        //and convert the 7 bit data to 8 bits

        let chunk_8bit = []

        for (let chunk of this.data) {
            let this_cmd = chunk[4]
            let this_sub_cmd = chunk[5]
            //let data7bit = chunk.subarray(6, chunk.length - 1);
            // for some reason, I get a TypeError subarrry is not a function here (why?), so I had to replace it with some ghetto code
            const uint8 = new Uint8Array(39);
            let original_chunk_len = 39;
            let data7bit : Uint8Array = new Uint8Array;
            for(let i = original_chunk_len - 1; i >= 6; i--) {
                if(chunk[i] == 0xf7)
                {
                    //data7bit = chunk.subarray(6,i);
                    data7bit = new Uint8Array(i-6);
                    for(let j = 6; j < i; j++) {
                        data7bit[j-6] = chunk[j];
                    }
                    i = 0;
                }
            }

            let chunk_len = len(data7bit)
            let num_seq = Math.floor((chunk_len + 7) / 8)
            let data8bit = bytes([])

            for (let this_seq = 0; this_seq < num_seq; this_seq++) {
                let seq_len = Math.min(8, chunk_len - (this_seq * 8))
                let seq = bytes([])
                let bit8 = data7bit[this_seq * 8]
                for (let ind = 0; ind < seq_len - 1; ind++) {
                    let dat = data7bit[this_seq * 8 + ind + 1]
                    if ((bit8 & (1 << ind)) == (1 << ind)) {
                        dat |= 0x80
                    }
                    seq = SparkMessageReader.mergeBytes(seq, bytes([dat]))
                }
                data8bit = SparkMessageReader.mergeBytes(data8bit, seq)
            }

            chunk_8bit.push([this_cmd, this_sub_cmd, data8bit])
        }
        //now check for mult-chunk messages and collapse their data into a single message
        //multi-chunk messages are cmd/sub_cmd of 1,1 or 3,1

        this.message = []
        let concat_data = bytes([])
        for (let chunk of chunk_8bit) {
            let this_cmd = chunk[0]
            let this_sub_cmd = chunk[1]
            let this_data = chunk[2]
            if ((this_cmd == 1 || this_cmd == 3) && this_sub_cmd == 1) {
                //found a multi-message
                let num_chunks = this_data[0]
                let this_chunk = this_data[1]
                concat_data = SparkMessageReader.mergeBytes(concat_data, this_data.subarray(3))

                //if at last chunk of multi-chunk
                if (this_chunk == num_chunks - 1) {
                    this.message.push(SparkMessageReader.mergeBytes(bytes(this_cmd), bytes(this_sub_cmd), concat_data))
                    concat_data = bytes([])
                }

            } else {
                //copy old one
                this.message.push(SparkMessageReader.mergeBytes(bytes(this_cmd), bytes(this_sub_cmd), this_data))
            }

        }
    }


    read_byte() {
        let a_byte = this.msg[this.msg_pos]
        this.msg_pos += 1
        return a_byte;
    }

    read_prefixed_string() {
        let str_len = this.read_byte()
        let str_len2 = this.read_byte() - 0xa0
        let a_str = ""
        for (let i = 0; i < str_len2; i++) {
            a_str += chr(this.read_byte())
        }
        return a_str
    }

    read_string() {


        let a_byte = this.read_byte()
        let str_len = null;
        if (a_byte == 0xd9) {
            a_byte = this.read_byte()
            str_len = a_byte
        } else if (a_byte >= 0xa0) {
            str_len = a_byte - 0xa0
        }
        else {
            a_byte = this.read_byte()
            str_len = a_byte - 0xa0
        }

        let a_str = ""
        if (str_len > 0) {
            for (let i = 0; i < str_len; i++) {
                let a = this.read_byte();
                if (a < 0x20 || a > 0x7e) a = 0x20; // force ascii range
                a_str += chr(a);
            }
        }
        else {
            a_str = "";
        }

        return a_str
    }

    //https://github.com/msgpack/msgpack/blob/master/spec.md#float-format-family
    read_float() {
        const prefix = this.read_byte() //should be ca
        let val = 0;

        let flt_bytes = this.msg
            .subarray(this.msg_pos, this.msg_pos + 4)
            .reverse()
            .slice(0);

        let floatArray = new Float32Array(flt_bytes.buffer);

        let f = floatArray[0];

        this.msg_pos += 4;
        return f;

    }

    read_onoff() {

        const a_byte = this.read_byte()
        if (a_byte == 0xc3) {
            return "On"
        }
        else if (a_byte == 0xc2) {
            return "Off"
        }
        else {
            return "?"
        }
    }


    start_str() {
        this.text = ""
        this.python = "{"
        this.raw = ""
        this.indent = ""
    }

    end_str() {
        this.python += "}"
    }

    add_indent() {
        this.indent += "\t"
    }


    del_indent() {
        this.indent = this.indent.substring(0, this.indent.length - 1)
    }

    add_python(python_str) {
        this.python += this.indent + python_str + "\n"
    }

    add_str(a_title, a_str, nature = "alL") {
        this.raw += a_str + " "
        this.text += this.indent + a_title + ":" + a_str + "\n"
        if (nature != "python") {
            this.python += this.indent + "\"" + a_title + "\":\"" + a_str + "\",\n"
        }
    }

    add_int(a_title, an_int, nature = "all") {
        this.raw += an_int + " "
        this.text += this.indent + a_title + ":" + an_int + "\n"
        if (nature != "python") {
            this.python += this.indent + "\"" + a_title + "\":" + an_int + ",\n"
        }
    }

    add_float(a_title, a_float, nature = "all") {
        this.raw += a_float + " "
        this.text += this.indent + a_title + ":" + a_float + "\n"
        if (nature == "python") {
            this.python += this.indent + a_float + ",\n"
        }
        else {
            this.python += this.indent + "\"" + a_title + "\": " + a_float + ",\n"
        }
    }

    //Functions to package a command for the Spark


    read_effect_parameter() {
        this.start_str()
        const effect = this.read_prefixed_string()
        const param = this.read_byte()
        const val = this.read_float()
        this.add_str("Effect", effect)
        this.add_int("Parameter", param)
        this.add_float("Value", val)
        this.end_str()

        this.receivedMessageQueue.push(<FxParamMessage>{ type: 'fx_param_msg', dspId: effect, value: val, index: param });
    }

    read_effect() {
        this.start_str()
        const effect1 = this.read_prefixed_string()
        const effect2 = this.read_prefixed_string()
        this.add_str("OldEffect", effect1)
        this.add_str("NewEffect", effect2)
        this.end_str()

        this.receivedMessageQueue.push(<FxChangeMessage>{ type: 'fx_change_msg', dspIdOld: effect1, dspIdNew: effect2 });
    }

    read_hardware_preset() {
        this.start_str()
        this.read_byte()
        const preset_num = this.read_byte()
        this.add_int("NewPreset", preset_num)
        this.end_str()

        this.deviceState.selectedPresetNumber = preset_num;
        this.receivedMessageQueue.push(<PresetChangeMessage>{ type: 'hardware_channel_current', presetNumber: preset_num });
    }

    read_store_hardware_preset() {
        this.start_str()
        this.read_byte()
        const preset_num = this.read_byte()
        this.add_int("NewStoredPreset", preset_num)
        this.end_str()

        this.deviceState.selectedPresetNumber = preset_num;
        this.receivedMessageQueue.push(<PresetChangeMessage>{ type: 'hardware_preset_stored', presetNumber: preset_num });
    }

    read_effect_onoff() {
        this.start_str()
        const effect = this.read_prefixed_string()
        const onoff = this.read_onoff()
        this.add_str("Effect", effect)
        this.add_str("OnOff", onoff)
        this.end_str()

        this.receivedMessageQueue.push(<FxToggleMessage>{ type: 'fx_toggled', dspId: effect, active: onoff == "On" });
    }

    read_current_preset_number() {
        this.read_byte()

        const current_preset = this.read_byte();
        this.deviceState.selectedPresetNumber = current_preset;
        this.receivedMessageQueue.push(<PresetChangeMessage>{ type: 'hardware_channel_current', presetNumber: current_preset });
    }

    read_bpm() {

        this.start_str();
        const bpm = this.read_float();
        this.add_float("BPM", bpm)
        this.end_str()

        this.deviceState.bpm = bpm;
        this.receivedMessageQueue.push(<BpmMessage>{ type: 'hardware_bpm', bpm: bpm });
    }

    read_preset() {

        let preset: Preset = {};

        this.start_str()
        const presetMsgType = this.read_byte()

        if (presetMsgType != 0) {
            this.receivedMessageQueue.push({ type: 'unknown', value: presetMsgType });
            return; //only parse full preset info
        }

        const presetNum = this.read_byte()
        this.deviceState.selectedPresetNumber = presetNum;

        this.add_int("Preset number", preset)
        const uuid = this.read_string()

        this.add_str("UUID", uuid)
        let name = this.read_string()

        this.add_str("Name", name)
        const version = this.read_string()
        this.add_str("Version", version)
        const descr = this.read_string()
        this.add_str("Description", descr)

        const icon = this.read_string()
        this.add_str("Icon", icon)
        const bpm = this.read_float()
        this.add_float("BPM", bpm)

        preset.meta = {
            id: uuid,
            name: name,
            version: version,
            description: descr,
            icon: icon
        };

        // const num_effects = this.read_byte() - 0x90
        this.add_python("\"Effects\": [")
        this.add_indent()

        let signalPaths = new Array<SignalPath>();

        for (let i = 0; i < 7; i++) {
            const e_str = this.read_string()
            const e_onoff = this.read_onoff()
            this.add_python("{")
            this.add_str("EffectName", e_str)
            this.add_str("OnOff", e_onoff)
            const num_p = this.read_byte() - 0x90
            this.add_python("\"Parameters\":[")
            this.add_indent()

            let fxParams = new Array<FxParam>();

            for (let p = 0; p < num_p; p++) {
                const num = this.read_byte()
                const spec = this.read_byte()
                const val = this.read_float()
                this.add_int("Parameter", num, "python")
                this.add_str("Special", hex(spec), "python")
                this.add_float("Value", val, "python")

                fxParams.push({ value: val, index: num })
            }
            this.add_python("],")
            this.del_indent()
            this.add_python("},")

            let signalPath: SignalPath = {
                active: (e_onoff == "On"),
                params: fxParams,
                dspId: e_str,
                type: "speaker_fx"
            };
            signalPaths.push(signalPath);

        }
        this.add_python("],")
        this.del_indent()
        const unk = this.read_byte()
        this.add_str("Unknown", hex(unk))
        this.end_str()

        preset.sigpath = signalPaths;
        preset.type = "jamup_speaker";

        this.receivedMessageQueue.push({ type: 'preset', value: <Preset>preset });
    }

    //

    set_interpreter(msg) {
        this.msg = msg
        this.msg_pos = 0
    }

    run_interpreter(cmd, sub_cmd) {
        if (cmd == 0x01) {
            if (sub_cmd == 0x01) {
                this.read_preset()
            }
            else if (sub_cmd == 0x04) {
                this.read_effect_parameter()
            }
            else if (sub_cmd == 0x06) {
                this.read_effect()
            }
            else if (sub_cmd == 0x15) {
                this.read_effect_onoff()
            }
            else if (sub_cmd == 0x38) {
                this.read_hardware_preset()
            }
            else {
                this.log(hex(cmd), hex(sub_cmd), "not handled")
            }
        }
        else if (cmd == 0x03) {
            if (sub_cmd == 0x01) {
                this.read_preset()
            }
            else if (sub_cmd == 0x06) {
                this.read_effect()
            }
            else if (sub_cmd == 0x10) {
                this.read_current_preset_number()
            }
            else if (sub_cmd == 0x15) {
                this.read_effect_onoff()
            }
            else if (sub_cmd == 0x27) {
                this.read_store_hardware_preset()
            }
            else if (sub_cmd == 0x37) {
                this.read_effect_parameter()
            }
            else if (sub_cmd == 0x38) {
                this.read_hardware_preset()
            }
            else if (sub_cmd == 0x63) {
                this.read_bpm()
            }
            else {
                this.log(hex(cmd), hex(sub_cmd), "not handled")
            }
        }
        else if (cmd == 0x04) {
            this.log(SparkMessageReader.getAckMessage(sub_cmd));
        }
        else {
            this.log("Unprocessed")
        }

        return 1
    }

    public static getAckMessage(sub_cmd) : string {
        let ackMsg = "Acknowledgement: ";

        switch (sub_cmd) {
            case 0x01: ackMsg += "Preset Chunk";
                break;
            case 0x05: ackMsg += "Preset Final Chunk";
                break;
            case 0x06: ackMsg += "Changed Amp Model";
                break;
            case 0x15: ackMsg += "Turn FX On/Off";
                break;
            case 0x38: ackMsg += "Changed Preset Number";
                break;
            case 0x70: ackMsg += "License Key";
                break;

        }
        return ackMsg;
    }

    log(...msg) {
        console.debug("[SparkMessageReader]: ", msg);
    }

    interpret_data() {
        this.log(`Interpreting ${this.message.length} messages `);
        for (let msg of this.message) {

            this.log("[RAW MSG]:" + buf2hex(msg));

            const this_cmd = msg[0]
            const this_sub_cmd = msg[1]
            const this_data = msg.subarray(2)

            this.set_interpreter(this_data)
            this.run_interpreter(this_cmd, this_sub_cmd)
        }
    }

    read_message() {
        this.structure_data()
        this.interpret_data()
        return this.message
    }

    readMessageQueue(): DeviceMessage[] {
        const received = [...this.receivedMessageQueue];
        this.receivedMessageQueue = [];
        return received;
    }
}
