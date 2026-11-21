import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

export type CliOptions = {
  panelDir: string;
};

/** Parse `--panel <path>`. Default panel is `public/` under the project root. */
export function parseCli(argv: string[] = process.argv.slice(2)): CliOptions {
  let panelArg: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--panel') {
      panelArg = argv[i + 1];
      if (!panelArg || panelArg.startsWith('-')) {
        throw new Error('Missing path after --panel');
      }
      i++;
      continue;
    }
    if (arg.startsWith('--panel=')) {
      panelArg = arg.slice('--panel='.length);
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  const panelDir = path.resolve(
    projectRoot,
    panelArg ?? path.join('public'),
  );

  if (!fs.existsSync(panelDir) || !fs.statSync(panelDir).isDirectory()) {
    throw new Error(`Panel directory not found: ${panelDir}`);
  }

  const indexPath = path.join(panelDir, 'index.html');
  if (!fs.existsSync(indexPath)) {
    throw new Error(`Panel directory must contain index.html: ${panelDir}`);
  }

  return { panelDir };
}