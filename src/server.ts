import express from 'express';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';
import { loadConfig } from './config.js';
import { SimConnections } from './simconnect.js';

const config = loadConfig();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', 'public');

const app = express();
app.use(express.static(publicDir));

const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
const sim = new SimConnections(config.simconnect.host, config.simconnect.port);

// Cache last messages so new browser tabs catch up immediately.
let lastStatus: { connected: boolean; sim?: string } = { connected: false };
let lastState: { on: boolean } | null = null;

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
  if (lastState) ws.send(JSON.stringify({ type: 'state', on: lastState.on }));

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(
        Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw),
      ) as { type?: string; on?: unknown };
      if (msg.type === 'set' && typeof msg.on === 'boolean') {
        sim.setControl(msg.on);
      }
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

sim.on('state', (state) => {
  lastState = state;
  broadcast({ type: 'state', on: state.on });
});

sim.start();

httpServer.listen(config.httpPort, () => {
  console.log(`UI http://localhost:${config.httpPort}`);
  console.log(
    `SimConnect ${config.simconnect.host}:${config.simconnect.port} (from config.json)`,
  );
});

process.on('SIGINT', () => {
  sim.stop();
  httpServer.close();
  process.exit(0);
});