# SimConnections

Browser test harness for MSFS 2024 via [node-simconnect](https://github.com/EvenAR/node-simconnect) (TCP). Demo control: **parking brake**.

## Prerequisites

- MSFS in an active flight
- SimConnect TCP enabled (see `config.json` → must match your `SimConnect.cfg`)

## Configuration

Edit **`config.json`** in the project root:

```json
{
  "httpPort": 3847,
  "simconnect": {
    "host": "127.0.0.1",
    "port": 5111
  }
}
```

Copy from `config.example.json` if needed. Optional: set `CONFIG_PATH` to use another file.

## Run

```bash
cd ~/MSFS2024/simconnections
bun install && bun run start
```

Open `http://localhost:<httpPort>` from config.

## WebSocket (`/ws`)

| Message | Meaning |
|---------|---------|
| `{"type":"status","connected":true,"sim":"SunRise"}` | Sim link up |
| `{"type":"state","on":true}` | Parking brake set |
| `{"type":"set","on":false}` | Client command |

## SimConnect (demo)

- **Read:** `BRAKE PARKING POSITION`, pushed ~1×/sim second → see `src/simconnect.ts` `bindSession`
- **Write:** `PARKING_BRAKE_SET` (`0` / `1`)

## Layout

```
config.json          # HTTP + SimConnect TCP targets
src/config.ts        # load config
src/simconnect.ts    # SimConnect session
src/server.ts        # static UI + WebSocket bridge
public/              # browser
```

## Higher-level libraries (optional)

This project talks to MSFS through **[node-simconnect](https://github.com/EvenAR/node-simconnect)** directly so the SimConnect flow stays easy to follow. If you add many simvars or controls, a wrapper such as **[msfs-simconnect-api-wrapper](https://github.com/Pomax/msfs-simconnect-api-wrapper)** (built on the same library) can reduce boilerplate via helpers like `periodic`, `get`, and `trigger`. You could swap only `src/simconnect.ts` behind the same WebSocket API without changing the browser UI.