import express from 'express';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { parseCli } from './cli.js';
import { loadConfig } from './config.js';
import { loadPanelManifest } from './panel.js';
import { PanelSimSession } from './simconnect.js';

const config = loadConfig();
const cli = parseCli();
const manifest = loadPanelManifest(cli.panelDir);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');
const clientRuntimePath = path.join(projectRoot, 'client', 'simconnections.js');

const app = express();
app.get('/__simconnections/client.js', (_req, res) => {
  res.type('application/javascript');
  res.sendFile(clientRuntimePath);
});
app.use(express.static(cli.panelDir));

const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
const sim = new PanelSimSession(
  config.simconnect.host,
  config.simconnect.port,
  manifest,
);

let lastStatus: { connected: boolean; sim?: string } = { connected: false };
let lastValues: Record<string, boolean> = {};

const writableIds = new Set(manifest.widgets.map((w) => w.id));

function broadcast(payload: object): void {
  const json = JSON.stringify(payload);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(json);
  }
}

wss.on('connection', (ws) => {
  ws.send(
    JSON.stringify({
      type: 'status',
      connected: lastStatus.connected,
      sim: lastStatus.sim,
    }),
  );
  ws.send(JSON.stringify({ type: 'values', widgets: lastValues }));

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(
        Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw),
      ) as { type?: string; id?: unknown; value?: unknown };

      if (
        msg.type === 'set' &&
        typeof msg.id === 'string' &&
        typeof msg.value === 'boolean'
      ) {
        if (!writableIds.has(msg.id)) {
          ws.send(
            JSON.stringify({ type: 'error', message: `Unknown widget: ${msg.id}` }),
          );
          return;
        }
        sim.setWidget(msg.id, msg.value);
        return;
      }

      ws.send(JSON.stringify({ type: 'error', message: 'Invalid message' }));
    } catch {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid message' }));
    }
  });
});

sim.on('status', (status) => {
  lastStatus = { connected: status.connected, sim: status.applicationName };
  broadcast({
    type: 'status',
    connected: status.connected,
    sim: status.applicationName,
  });
});

sim.on('values', (values) => {
  lastValues = values;
  broadcast({ type: 'values', widgets: values });
});

sim.start();

httpServer.listen(config.httpPort, () => {
  console.log(`UI http://localhost:${config.httpPort}`);
  console.log(`Panel ${cli.panelDir}`);
  console.log(
    `SimConnect ${config.simconnect.host}:${config.simconnect.port} (from config.json)`,
  );
});

process.on('SIGINT', () => {
  sim.stop();
  httpServer.close();
  process.exit(0);
});