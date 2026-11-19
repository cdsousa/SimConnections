import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type AppConfig = {
  httpPort: number;
  simconnect: {
    host: string;
    port: number;
  };
};

const projectRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Load config.json from the project root (override path with CONFIG_PATH). */
export function loadConfig(): AppConfig {
  const configPath =
    process.env.CONFIG_PATH ?? path.join(projectRoot, 'config.json');

  if (!fs.existsSync(configPath)) {
    throw new Error(
      `Missing ${configPath}. Copy config.example.json to config.json and edit simconnect host/port.`,
    );
  }

  const raw = JSON.parse(fs.readFileSync(configPath, 'utf8')) as {
    httpPort?: number;
    simconnect?: { host?: string; port?: number };
  };

  const host = raw.simconnect?.host;
  const port = raw.simconnect?.port;
  const httpPort = raw.httpPort;

  if (!host || typeof port !== 'number' || typeof httpPort !== 'number') {
    throw new Error(
      `${configPath} must include httpPort and simconnect.host / simconnect.port`,
    );
  }

  return { httpPort, simconnect: { host, port } };
}