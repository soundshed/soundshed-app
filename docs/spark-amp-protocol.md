# Spark Amp Communication Protocol

A guide to how software communicates with the Positive Grid Spark amplifier over Bluetooth.

This document is based on community reverse-engineering work from multiple projects:
- [soundshed/spark-app](https://github.com/nicholasgasior/soundshed) (TypeScript)
- [paulhamsh/Spark-Bluetooth-Message-Format](https://github.com/paulhamsh/Spark-Bluetooth-Message-Format/)
- [richtamblyn/PGSparkLite](https://github.com/richtamblyn/PGSparkLite/) (Python)
- [~ianloic/kraps](https://git.sr.ht/~ianloic/kraps) (Firmware reverse engineering)

---

## Table of Contents

1. [Overview](#1-overview)
2. [Bluetooth Connection](#2-bluetooth-connection)
3. [Message Structure](#3-message-structure)
4. [Data Encoding](#4-data-encoding)
5. [Commands](#5-commands)
6. [Presets](#6-presets)
7. [Signal Chain & Effects](#7-signal-chain--effects)
8. [Worked Examples](#8-worked-examples)
9. [Timing & Reliability](#9-timing--reliability)

---

## 1. Overview

The Spark amp communicates using Bluetooth, either via **Bluetooth Classic (RFCOMM)** on desktop/Raspberry Pi or **Bluetooth Low Energy (BLE)** on mobile and web platforms. The protocol on the wire is the same in both cases.

Messages are loosely based on two standards:
- **MIDI SysEx** — the outer framing (start/end markers)
- **MessagePack** — the inner data encoding (strings, floats, booleans)

Neither standard is followed exactly. The protocol has its own quirks, so treat this document as the authority rather than the SysEx or MessagePack specs.

### Communication Pattern

Communication follows a simple request/response model:

```
App  ──── command ────►  Spark Amp
App  ◄─── acknowledgement ───  Spark Amp   (for most commands)
App  ◄─── state update ──────  Spark Amp   (when knobs/buttons change on the amp)
```

There are two message directions:

| Direction | Marker Bytes | Meaning |
|-----------|-------------|---------|
| App → Amp | `53 fe` | Sending a command to the amp |
| Amp → App | `41 ff` | Receiving a response from the amp |

---

## 2. Bluetooth Connection

### BLE (Mobile / Web)

| Item | UUID |
|------|------|
| Service | `0000ffc0-0000-1000-8000-00805f9b34fb` |
| Send commands on | Characteristic `ffc1` |
| Receive updates on | Characteristic `ffc2` |

**Connection steps:**

1. Scan for devices using the service UUID `ffc0` (device names vary by model — "Spark 40", "Spark MINI", "Spark GO", etc.)
2. Connect to the device's GATT server
3. Find the service with UUID `ffc0`
4. Get the two characteristics:
   - **ffc1** — you write commands here
   - **ffc2** — you subscribe to notifications here to receive responses
5. Start notifications on `ffc2`
6. You're connected and ready to send commands

### Bluetooth Classic (Desktop / Raspberry Pi)

1. Scan for a device named "Spark 40 Audio"
2. Open an RFCOMM socket on **channel 2**
3. Send and receive raw bytes on the socket

---

## 3. Message Structure

Every message is wrapped in **blocks**. A block contains a **header**, a **chunk** of data, and a **terminator**. Large messages (like presets) are split across multiple blocks.

### Block Layout

A block looks like this:

```
┌─────────────────────────────────────────────────┐
│  Block Header (16 bytes)                        │
│  ┌─────────────────────────────────────────────┐│
│  │  Chunk Header (4 bytes)                     ││
│  │  Command + Sub-command (2 bytes)            ││
│  │  Payload (variable length, 7-bit encoded)   ││
│  │  Terminator: f7                             ││
│  └─────────────────────────────────────────────┘│
└─────────────────────────────────────────────────┘
```

### Block Header (16 bytes)

| Offset | Bytes | Meaning |
|--------|-------|---------|
| 0–1 | `01 fe` | Start marker (always the same) |
| 2–3 | `00 00` | Reserved |
| 4–5 | `53 fe` or `41 ff` | Direction (to amp / from amp) |
| 6 | 1 byte | Total block size (including this header) |
| 7–15 | `00` × 9 | Padding (always zeros) |

### Chunk Header (6 bytes, starting at offset 16)

| Offset | Bytes | Meaning |
|--------|-------|---------|
| 16–17 | `f0 01` | Chunk start marker |
| 18–19 | `3a 15` | Fixed in our implementation. Other sources describe byte 18 as a sequence number and byte 19 as a checksum/XOR of the data. The amp does not appear to validate these bytes. |
| 20 | 1 byte | **Command** |
| 21 | 1 byte | **Sub-command** |

### Terminator

Every chunk ends with a single byte: **`f7`**

### Multi-Block Messages

When a message is too large for one block (e.g. a full preset), it gets split into multiple blocks. Each chunk within a multi-block message starts with a small inner header:

| Byte | Meaning |
|------|---------|
| 1 | Total number of chunks |
| 2 | This chunk's index (starting from 0) |
| 3 | Number of data bytes in this chunk (always present in every chunk) |

**Maximum block sizes:**
- Sending to amp: **~173 bytes** (`0xad`)
- Receiving from amp: **~106 bytes** (`0x6a`)
- Maximum chunk payload (before encoding): **128 bytes** (`0x80`)

> **Note:** When receiving from the amp, chunks can span across block boundaries — a chunk might start in one block and end in the next. When sending to the amp, each block contains exactly one chunk.

---

## 4. Data Encoding

### 7-Bit / 8-Bit Conversion

The payload inside each chunk uses a **7-bit encoding** scheme. Every group of up to 7 data bytes is preceded by a "bit 8" byte that stores the high bits.

**Encoding (8-bit → 7-bit), when sending:**

```
For every 7 bytes of data:
  1. Create a "high-bit" byte, starting at 0
  2. For each of the 7 bytes:
     - If the byte's high bit (bit 7) is set:
         • Set the corresponding bit in the high-bit byte
         • Clear bit 7 of the data byte
  3. Output: [high-bit byte] [7 modified data bytes]
```

**Decoding (7-bit → 8-bit), when receiving:**

```
For every group of 8 bytes (1 high-bit byte + up to 7 data bytes):
  1. Read the first byte as the high-bit byte
  2. For each of the remaining 7 bytes:
     - If the corresponding bit in the high-bit byte is set:
         • Set bit 7 of this data byte (OR with 0x80)
  3. Output the 7 reconstructed bytes
```

### Data Types

Once you've decoded the 7-bit encoding back to 8-bit, the payload contains these data types (inspired by MessagePack):

| Type | Format | Example |
|------|--------|---------|
| **Boolean On** | `c3` | Effect is on |
| **Boolean Off** | `c2` | Effect is off |
| **Float** | `ca` + 4 bytes (big-endian IEEE 754) | `ca 3f 00 00 00` = 0.5 |
| **Short string** | `(0xa0 + length)` + string bytes | `a5 54 77 69 6e` = "Twin" |
| **Prefixed string** | `length byte` + `(0xa0 + length)` + string bytes | `04 a4 46 75 7a 7a` = "Fuzz" |
| **Long string** | `d9` + `length byte` + string bytes | For strings longer than 31 bytes |
| **Small number** | Just the byte value | Parameter index, preset number |
| **Array marker** | `(0x90 + count)` | `97` = array of 7 items (the pedal chain) |

**Prefixed strings** are used for effect names in commands — they carry the string length twice (once bare, once added to `0xa0`). This seems redundant but is required by the amp.

### Float Values

Floating point values represent knob positions. The amp stores all parameter values as **0.0 to 1.0**, even though the app UI might display 0–10 (just divide by 10).

Encoding: standard IEEE 754 single-precision (32-bit), big-endian byte order, preceded by `ca`.

---

## 5. Commands

Every message has a **command** byte and a **sub-command** byte that identify what it does.

### Command Types

| Command | Code | Meaning |
|---------|------|---------|
| **SET** | `01` | App tells the amp to change effects, parameters, or presets |
| **GET** | `02` | App asks the amp for information |
| **RESPONSE / SET** | `03` | Amp sends updates to app; also used by the app for amp model and store commands (see below) |
| **ACK** | `04` | Amp acknowledges a command |

### SET Commands — cmd `01` (App → Amp)

| Sub‑cmd | Action | Payload |
|---------|--------|--------|
| `01` | **Send full preset** | Complete preset data (multi-block; see [Presets](#6-presets)) |
| `04` | **Change effect knob value** | Effect name (prefixed string) + parameter index (byte) + new value (float) |
| `06` | **Swap an effect** | Old effect name (prefixed string) + new effect name (prefixed string) |
| `15` | **Toggle effect on/off** | Effect name (prefixed string) + `c3` (on) or `c2` (off) |
| `38` | **Switch preset** | `00` + preset number (`00`–`03`) |

### Amp-Specific Commands — cmd `03` (App → Amp)

The amp model has its own set of commands that use cmd `03` instead of `01`. These are sent **from the app to the amp** even though they share the same command byte as responses.

| Sub‑cmd | Action | Payload |
|---------|--------|--------|
| `06` | **Swap the amp model** | Old amp DSP name (prefixed string) + new amp DSP name (prefixed string) |
| `27` | **Store current preset to hardware slot** | `00` + slot number (`00`–`03`) |
| `37` | **Change amp knob value** | Amp DSP name (prefixed string) + parameter index (byte) + new value (float) |

### GET Commands (App → Amp)

| Sub‑cmd | Action | Payload |
|---------|--------|---------|
| `01` | **Get preset data** | Preset number (`00`–`03`), or `01 00` for "current state" |
| `10` | **Get current preset number** | *(none)* |
| `11` | **Get amp name** | *(none)* |
| `23` | **Get serial number** | *(none)* |

### RESPONSE Commands — cmd `03` (Amp → App)

The amp sends these to report its state. Note that sub-commands `06`, `27`, and `37` are shared with the amp-specific App→Amp commands above — the direction is determined by context.

| Sub‑cmd | Meaning | Payload |
|---------|---------|--------|
| `01` | **Preset data** | Full preset (multi-block) |
| `06` | **Effect/amp was swapped** | Old and new effect names |
| `10` | **Current preset number** | `00` + preset number |
| `15` | **Effect toggled** | Effect name + on/off |
| `27` | **Preset was stored** | `00` + slot number |
| `37` | **Knob changed on amp** | Effect name + parameter index + new value |
| `38` | **Preset was switched** | `00` + preset number |
| `63` | **BPM update** | BPM as a float |

### ACK Commands (Amp → App)

After most SET commands, the amp sends back an ACK with the same sequence number and a sub-command matching what was sent:

| Sub‑cmd | Acknowledges |
|---------|-------------|
| `01` | Preset chunk received |
| `05` | Preset final chunk received |
| `06` | Effect / amp model swap |
| `15` | Effect on/off toggle |
| `38` | Preset switch |
| `70` | License key |

> **Note:** Changing a knob value (sub-command `04`) does NOT produce an ACK.

---

## 6. Presets

A preset contains everything about the amp's current sound: which effects are loaded, whether each is on or off, and all knob positions.

### Preset Structure

Presets are sent using command `01`, sub-command `01`, as a **multi-block message**.

The data, once decoded from 7-bit, follows this structure:

```
00                          ← fixed zero byte
Channel number              ← 00-03 for hardware presets, 7f for "temporary"
UUID                        ← long string (36 characters)
Name                        ← string (e.g. "Silver Ship")
Version                     ← string (e.g. "0.7")
Description                 ← string or long string
Icon                        ← string (usually "icon.png")
BPM                         ← float (e.g. 120.0)
97                          ← array marker: 7 pedals follow

  For each of 7 pedals:
    Effect name             ← string (e.g. "RolandJC120")
    On/Off                  ← c3 (on) or c2 (off)
    (90 + parameter count)  ← e.g. 95 means 5 parameters

      For each parameter:
        Parameter index     ← byte (0, 1, 2, …)
        91                  ← separator (always 0x91)
        Value               ← float (0.0 to 1.0)

Checksum                    ← 1 byte (see below)
```

### Preset Channels

| Channel | Meaning |
|---------|---------|
| `00` | Hardware preset 1 |
| `01` | Hardware preset 2 |
| `02` | Hardware preset 3 |
| `03` | Hardware preset 4 |
| `7f` | Temporary / software preset (not saved to amp) |

### Preset Checksum

The last byte of a preset is a checksum calculated over all bytes between the channel number and the end of the last pedal's parameters:

```
checksum = 0
for each byte in the preset data (after channel):
    if byte > 127:
        checksum += 0xCC    (204 in decimal)
    else:
        checksum += byte
checksum = checksum mod 256
```

> **Note:** The amp appears to accept presets even if the checksum is wrong, but the app validates it. Sending a correct checksum is recommended.

---

## 7. Signal Chain & Effects

The Spark always has exactly **7 effect slots** in a fixed order. You can swap which effect is in each slot, but the slot order never changes.

### The 7 Slots

| Slot | Type | Purpose |
|------|------|---------|
| 0 | **Gate** | Noise gate |
| 1 | **Comp** | Compressor |
| 2 | **Drive** | Overdrive / distortion / boost |
| 3 | **Amp** | Amplifier model |
| 4 | **Mod** | Modulation (chorus, flanger, etc.) |
| 5 | **Delay** | Delay / echo |
| 6 | **Reverb** | Reverb |

### Effect Names

Effects are identified by internal DSP names (strings). Here is the mapping between what the app shows and what the protocol uses:

#### Noise Gate

| App Name | Protocol Name |
|----------|--------------|
| Noise Gate | `bias.noisegate` |

#### Compressors

| App Name | Protocol Name |
|----------|--------------|
| LA Comp | `LA2AComp` |
| Sustain Comp | `BlueComp` |
| Red Comp | `Compressor` |
| Bass Comp | `BassComp` |
| Optical Comp | `BBEOpticalComp` |

#### Drive / Distortion

| App Name | Protocol Name |
|----------|--------------|
| Booster | `Booster` |
| Tube Drive | `DistortionTS9` |
| Over Drive | `Overdrive` |
| Fuzz Face | `Fuzz` |
| Black Op | `ProCoRat` |
| Metal Zone | `MetalZoneMT2` |
| Bass Muff | `BassBigMuff` |
| Guitar Muff | `GuitarMuff` |
| Bassmaster | `MaestroBassmaster` |
| SAB Driver | `SABdriver` |
| Treble Booster | `TrebleBooster` |
| Sansamp | `Sansamp` |

#### Amplifiers

| App Name | Protocol Name |
|----------|--------------|
| Silver 120 | `RolandJC120` |
| Black Duo | `Twin` |
| AD Clean | `ADClean` |
| Match DC | `94MatchDCV2` |
| Tweed Bass | `Bassman` |
| AC Boost | `AC Boost` |
| Checkmate | `Checkmate` |
| Two Stone SP50 | `TwoStoneSP50` |
| American Deluxe | `Deluxe65` |
| Plexiglass | `Plexi` |
| JM45 | `OverDrivenJM45` |
| Lux Verb | `OverDrivenLuxVerb` |
| RB 101 | `Bogner` |
| British 30 | `OrangeAD30` |
| American High Gain | `AmericanHighGain` |
| SLO 100 | `SLO100` |
| YJM100 | `YJM100` |
| Treadplate | `Rectifier` |
| Insane | `EVH` |
| Switch Axe | `SwitchAxeLead` |
| Rocker V | `Invader` |
| BE 101 | `BE101` |
| Pure Acoustic | `Acoustic` |
| Fishboy | `AcousticAmpV2` |
| Jumbo | `FatAcousticV2` |
| Flat Acoustic | `FlatAcoustic` |
| RB-800 | `GK800` |
| Sunny 3000 | `Sunny3000` |
| W600 | `W600` |
| Hammer 500 | `Hammer500` |
| JCM800 | `JCM800` |
| '57 Deluxe | `Deluxe57` |
| JCM900 | `JCM900` |
| Matchless DC30 | `MatchlessDC30` |
| Dr Z | `DrZ` |
| ENGL | `ENGL` |

Additional bass-specific amps: `SVT`, `PowerAmp`, `LaneyDH50`, `Hiwatt103`, `RedHead`, `B15`, `Acoustic360`, `GK700RBII`, `OrangeAD200`, `SuperBassman`, `AcousticPro`, `AcousticImg`, `RB101B1`

#### Modulation

| App Name | Protocol Name |
|----------|--------------|
| Tremolo | `Tremolo` |
| Chorus | `ChorusAnalog` |
| Flanger | `Flanger` |
| Phaser | `Phaser` |
| Vibrato | `Vibrato01` |
| UniVibe | `UniVibe` |
| Cloner Chorus | `Cloner` |
| Classic Vibe | `MiniVibe` |
| Tremolator | `Tremolator` |
| Tremolo Square | `TremoloSquare` |

#### Delay

| App Name | Protocol Name |
|----------|--------------|
| Digital Delay | `DelayMono` |
| Echo Filt | `DelayEchoFilt` |
| Vintage Delay | `VintageDelay` |
| Reverse Delay | `DelayReverse` |
| Multi Head | `DelayMultiHead` |
| Echo Tape | `DelayRe201` |

#### Reverb

| App Name | Protocol Name |
|----------|--------------|
| All reverb types | `bias.reverb` |

> **Reverb note:** Reverb always uses the name `bias.reverb`. The specific reverb *type* (hall, plate, spring, etc.) is encoded as a float value in **parameter index 6**. Software maps this float to the reverb type.

### Effect Parameters

Each effect has a set of parameters (knobs). Parameters are identified by their **index** (starting at 0) and have float values from **0.0 to 1.0**.

Typical amp parameters:

| Index | Parameter |
|-------|-----------|
| 0 | Gain |
| 1 | Treble |
| 2 | Middle |
| 3 | Bass |
| 4 | Master Volume |

The number and meaning of parameters vary by effect. Most effects have 4–6 parameters.

---

## 8. Worked Examples

### Example 1: Switch to Preset 2

Switch the amp to hardware preset 2 (index `01`).

**Payload (before 7-bit encoding):**
```
00 01   ← 00 = padding, 01 = preset index
```

**Full command:** SET (`01`) sub-command `38`, with payload `00 01`.

After adding block header, chunk header, 7-bit encoding, and terminator:
```
01 fe 00 00 53 fe [size] 00 00 00 00 00 00 00 00 00    ← block header
f0 01 3a 15 01 38                                       ← chunk header + command
[7-bit encoded: 00 01]                                   ← payload
f7                                                       ← terminator
```

### Example 2: Turn the Delay Off

**Payload (before 7-bit encoding):**
```
0c ac 56 69 6e 74 61 67 65 44 65 6c 61 79   ← prefixed string "VintageDelay"
c2                                            ← boolean Off
```

**Command:** SET (`01`) sub-command `15`.

### Example 3: Change Amp Gain to 75%

**Payload (before 7-bit encoding):**
```
0c ac 52 6f 6c 61 6e 64 4a 43 31 32 30   ← prefixed string "RolandJC120"
00                                         ← parameter index 0 (Gain)
ca 3f 40 00 00                             ← float 0.75
```

**Command:** SET (`01`) sub-command `04`.

### Example 4: Request Current Amp State

To get whatever the amp currently has loaded (regardless of which preset button is active):

**Command:** GET (`02`) sub-command `01`, with preset number `01 00` (meaning "current").

The amp replies with RESPONSE (`03`) sub-command `01` containing the full preset.

---

## 9. Timing & Reliability

### Timing

- Wait at least **500 ms** between sending commands
- After receiving the last chunk of a multi-block response, wait **~300 ms** before processing to make sure all chunks have arrived
- The amp may take a moment to respond to GET commands, especially when sending full presets

### Reliability Tips

- Data from the amp can be **unreliable** — code defensively and handle malformed messages gracefully
- Always look for the `f7` terminator to know when a chunk ends
- When receiving, chunks can span block boundaries — don't assume a chunk starts at the beginning of a block
- The sequence number stays the same across all blocks of a multi-block message — use this to group them
- ACKs come for most commands but **not** for parameter changes (sub-command `04`)
- The checksum byte (offset 19 in the chunk header) is an XOR of the data bytes. The app checks it but the amp seems to ignore it

### Initial Connection Sequence

When first connecting, apps typically send these requests in order:

1. GET amp name (sub-command `11`)
2. GET serial number (sub-command `23`)
3. GET current preset number (sub-command `10`)
4. GET preset data for presets 0–3 (sub-command `01`)

This gives you the amp's identity and its full current state.

---

## Quick Reference Card

### Byte Markers

| Byte(s) | Meaning |
|---------|---------|
| `01 fe` | Block start |
| `53 fe` | Direction: to amp |
| `41 ff` | Direction: from amp |
| `f0 01` | Chunk start |
| `f7` | Chunk end |
| `c2` | Boolean false / Off |
| `c3` | Boolean true / On |
| `ca` | Float follows (4 bytes) |
| `d9` | Long string follows |
| `a0`–`bf` | Short string (length = byte − `a0`) |
| `90`–`9f` | Array (count = byte − `90`) |
| `91` | Parameter separator |
| `97` | Array of 7 (the pedal chain) |

### Command Quick Reference

| cmd | sub | Direction | Action |
|-----|-----|-----------|--------|
| `01` | `01` | App→Amp | Send preset |
| `01` | `04` | App→Amp | Change parameter value |
| `01` | `06` | App→Amp | Swap effect |
| `01` | `15` | App→Amp | Toggle effect on/off |
| `01` | `38` | App→Amp | Switch hardware preset |
| `03` | `06` | App→Amp | Swap amp model |
| `03` | `27` | App→Amp | Store current preset to slot |
| `03` | `37` | App→Amp | Change amp parameter value |
| `02` | `01` | App→Amp | Request preset |
| `02` | `10` | App→Amp | Request current preset number |
| `02` | `11` | App→Amp | Request amp name |
| `02` | `23` | App→Amp | Request serial number |
| `03` | `01` | Amp→App | Preset data |
| `03` | `06` | Amp→App | Effect changed |
| `03` | `10` | Amp→App | Current preset number |
| `03` | `15` | Amp→App | Effect toggled |
| `03` | `27` | Amp→App | Preset stored |
| `03` | `37` | Amp→App | Parameter changed (knob turned) |
| `03` | `38` | Amp→App | Preset changed |
| `03` | `63` | Amp→App | BPM changed |
| `04` | `01` | Amp→App | ACK: preset chunk |
| `04` | `05` | Amp→App | ACK: preset final chunk |
| `04` | `06` | Amp→App | ACK: effect/amp swap |
| `04` | `15` | Amp→App | ACK: effect on/off |
| `04` | `38` | Amp→App | ACK: preset switch |
| `04` | `70` | Amp→App | ACK: license key |
