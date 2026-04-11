# Spark Amp Simulator (TypeScript)

Node.js protocol-level Spark simulator that can emulate multiple Spark amp models for integration testing.

## What It Emulates

- Model identity profiles:
  - `spark-40`
  - `spark-mini`
  - `spark-go`
  - `spark-neo`
  - `spark-2`
- Preset slot count per model (`4` for most models, `8` for Spark 2)
- Core GET/SET protocol flows used by the app:
  - `02 01` get preset
  - `02 10` get selected channel
  - `02 11` get device name
  - `02 23` get serial
  - `01 01` upload preset (chunked)
  - `01 38` switch preset
  - basic ACK behavior for effect/amp swaps and toggle commands
- Spark 2 specific behavior:
  - chunk ACK `cmd 05` for non-final preset chunks
  - final chunk ACK `cmd 04`
  - live sync handling (`02 1a` -> `03 1a`, includes `03 62` after upload)

## What It Does Not Emulate

- Full DSP/audio behavior.

## BLE Peripheral Mode (Experimental)

BLE peripheral mode is available behind a CLI transport flag.

Install BLE peripheral runtime dependency:

```bash
npm install --save-dev @stoprocent/bleno
```

Then run with BLE transport:

```bash
npm run sim:spark -- --model spark-2 --transport ble --verbose
```

Run both TCP + BLE at once:

```bash
npm run sim:spark -- --model spark-2 --transport both --port 9124 --host 127.0.0.1 --verbose
```

Notes:

- BLE adapter must support peripheral mode.
- On some platforms, peripheral mode may require elevated privileges.
- `@abandonware/bleno` support varies by platform. If BLE mode cannot start, use TCP transport or run BLE mode on a supported host.
- The simulator advertises model-appropriate Spark custom service/characteristics (`ffc0/ffc1/ffc2` or `ffc8/ffc9/ffca`).

## Build

From repo root:

```bash
npm run build-tools
```

## Run

From repo root:

```bash
npm run sim:spark -- --model spark-2 --port 9124 --host 127.0.0.1 --verbose
```

When running in an interactive terminal, the simulator now shows a live TUI dashboard with:

- decorative boxed console panels
- selected slot and preset-bank counts
- current channel preset summary (name/UUID/BPM/FX chain)
- upload state and last command/sub-command
- TCP endpoint, connected clients, RX/TX frame counters
- recent simulator/server logs

Disable TUI if needed:

```bash
npm run sim:spark -- --model spark-2 --transport tcp --port 9124 --host 127.0.0.1 --verbose --no-tui
```

Use with app TCP mode:

- In `src/env.ts`, set `SparkTransport` to `"tcp-sim"`.
- Ensure `SparkSimulatorHost` / `SparkSimulatorPort` match the simulator host/port.
- Start the app, then scan/connect devices in UI (a virtual TCP simulator device is exposed).

Show help:

```bash
npm run sim:spark:help
```

Or build + run in one step:

```bash
npm run sim:spark:build -- --model spark-2 --port 9124 --host 127.0.0.1 --verbose
```

## Integration Test Tool (Headless)

Run a simulator + client integration test outside the app UI.

This tool:

- starts the simulator TCP server in-process
- connects over TCP as a client
- uses app communication modules (`SparkCommandMessage` + `SparkMessageReader`) from built spork output
- exercises a broad command flow (get channel/name/serial/preset, channel switch, preset upload chunk ACK flow, live sync, preset store, amp/fx/toggle/param ACK paths)
- logs JSON snapshots for simulated amp presets and received/uploaded preset payloads

Run full test (rebuild app TS + tools first):

```bash
npm run sim:spark:test
```

Run quick test (rebuild tools only):

```bash
npm run sim:spark:test:quick
```

Optional args:

```bash
npm run sim:spark:test:quick -- --model spark-2 --host 127.0.0.1 --port 9124 --verbose
```

If build output for spork modules is missing, run `npx tsc` first.

List models:

```bash
npm run sim:spark -- --models
```

Transport quick aliases:

```bash
npm run sim:spark:ble -- --model spark-40 --verbose
npm run sim:spark:both -- --model spark-2 --port 9124 --host 127.0.0.1 --verbose
```

## Transport

- TCP server (default `127.0.0.1:9124`) and optional BLE peripheral transport
- Expects Spark protocol frames ending with `f7`
- Sends binary Spark protocol frames back to client

## Files

- `tools/spark-amp-simulator/src/models.ts`: model profiles
- `tools/spark-amp-simulator/src/protocol.ts`: frame encode/decode
- `tools/spark-amp-simulator/src/presetFactory.ts`: default preset payload generation
- `tools/spark-amp-simulator/src/simulator.ts`: model state + command handling
- `tools/spark-amp-simulator/src/server.ts`: TCP server transport
- `tools/spark-amp-simulator/src/blePeripheral.ts`: BLE peripheral transport
- `tools/spark-amp-simulator/src/cli.ts`: CLI entry point
