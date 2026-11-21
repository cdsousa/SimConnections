# SimConnections

Browser UI for MSFS 2024 via [node-simconnect](https://github.com/EvenAR/node-simconnect) (TCP). The Node server owns SimConnect; custom **panel folders** define layout in HTML and bindings in `panel.json`.

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
cd ~/MSFS2024/SimConnections
bun install && bun run start
```

Open `http://localhost:<httpPort>` from config.

**Custom panel folder** (must contain `index.html` and `panel.json`):

```bash
bun run start -- --panel ./panels/example
```

**Exterior lights** (iniBuilds A320neo v2 — wing first, `L:INI_WING_LIGHT_SWITCH`):

```bash
bun run start -- --panel ./panels/ext-light
```

With no `--panel`, the default demo in `public/` is served.

## Custom panels

A panel directory needs:

| File | Role |
|------|------|
| `index.html` | Layout and widgets |
| `panel.json` | SimConnect bindings (server reads at startup) |
| `style.css`, assets | Optional styling |

In HTML:

- Include `<script src="/__simconnections/client.js"></script>` (bundled runtime from the server).
- Mark connection text with `data-sc-status`.
- Bind boolean toggles: `<input type="checkbox" data-sc-widget="yourWidgetId" />`.

### `panel.json` (v1)

```json
{
  "version": 1,
  "widgets": [
    {
      "id": "parkingBrake",
      "type": "bool",
      "read": {
        "name": "BRAKE PARKING POSITION",
        "unit": "bool",
        "datum": "int32"
      },
      "write": {
        "event": "PARKING_BRAKE_SET",
        "on": 1,
        "off": 0
      }
    }
  ]
}
```

See `panels/example/` for a minimal custom panel (simvar + sim event).

### `lvar-bool` / `lvar-enum` widgets

Aircraft local variables (read/write via `L:…`, FLOAT64). Enum values must match Behaviours (cycle the switch in the Variables tab if unsure).

```json
{
  "id": "strobeLight",
  "type": "lvar-enum",
  "lvar": "INI_STROBE_LIGHT_SWITCH",
  "states": [
    { "value": 2, "label": "OFF" },
    { "value": 1, "label": "AUTO" },
    { "value": 0, "label": "ON" }
  ]
}
```

```json
{
  "id": "wingLight",
  "type": "lvar-bool",
  "lvar": "INI_WING_LIGHT_SWITCH",
  "on": 1,
  "off": 0
}
```

HTML: checkbox for `lvar-bool`; for `lvar-enum`, a `data-sc-type="enum"` container with `button[data-sc-value]` (see `panels/ext-light/`).

## WebSocket (`/ws`)

| Message | Meaning |
|---------|---------|
| `{"type":"status","connected":true,"sim":"SunRise"}` | Sim link up |
| `{"type":"values","widgets":{"parkingBrake":true}}` | Snapshot of all widget values |
| `{"type":"set","id":"parkingBrake","value":false}` | Client command |

## SimConnect (demo widget)

- **Read:** `BRAKE PARKING POSITION`, pushed ~1×/sim second → see `src/simconnect.ts`
- **Write:** `PARKING_BRAKE_SET` (`0` / `1`)

## Layout

```
config.json              # HTTP + SimConnect TCP targets
src/cli.ts               # --panel parsing
src/panel.ts             # panel.json load/validate
src/simconnect.ts        # SimConnect session from manifest
src/server.ts            # static panel + WebSocket bridge
client/simconnections.js # browser runtime
public/                  # default demo panel
panels/example/          # sample custom panel
```

## Higher-level libraries (optional)

This project talks to MSFS through **[node-simconnect](https://github.com/EvenAR/node-simconnect)** directly so the SimConnect flow stays easy to follow. If you add many simvars or controls, a wrapper such as **[msfs-simconnect-api-wrapper](https://github.com/Pomax/msfs-simconnect-api-wrapper)** (built on the same library) can reduce boilerplate. You could swap only `src/simconnect.ts` behind the same WebSocket API without changing panel HTML.