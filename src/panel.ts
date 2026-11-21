import fs from 'node:fs';
import path from 'node:path';

export type BoolWidgetRead = {
  name: string;
  unit: string;
  datum: 'int32';
};

export type BoolWidgetWrite = {
  event: string;
  on: number;
  off: number;
};

export type BoolWidget = {
  id: string;
  type: 'bool';
  read: BoolWidgetRead;
  write: BoolWidgetWrite;
};

/** Boolean switch backed by an L: local var (FLOAT64 write via setDataOnSimObject). */
export type LvarBoolWidget = {
  id: string;
  type: 'lvar-bool';
  /** Name without the L: prefix, e.g. INI_WING_LIGHT_SWITCH */
  lvar: string;
  on: number;
  off: number;
};

export type PanelWidget = BoolWidget | LvarBoolWidget;

export type PanelManifest = {
  version: 1;
  widgets: PanelWidget[];
};

const ALLOWED_DATUMS = new Set(['int32']);

function lvarDatumName(lvar: string): string {
  return lvar.startsWith('L:') ? lvar : `L:${lvar}`;
}

/** Load and validate `panel.json` from a panel directory. */
export function loadPanelManifest(panelDir: string): PanelManifest {
  const manifestPath = path.join(panelDir, 'panel.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(
      `Missing panel.json in ${panelDir}. Add a manifest describing widgets and SimConnect bindings.`,
    );
  }

  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch {
    throw new Error(`Invalid JSON in ${manifestPath}`);
  }

  if (!raw || typeof raw !== 'object') {
    throw new Error(`${manifestPath}: root must be an object`);
  }

  const obj = raw as Record<string, unknown>;
  if (obj.version !== 1) {
    throw new Error(`${manifestPath}: version must be 1`);
  }

  if (!Array.isArray(obj.widgets) || obj.widgets.length === 0) {
    throw new Error(`${manifestPath}: widgets must be a non-empty array`);
  }

  const ids = new Set<string>();
  const widgets: PanelWidget[] = [];

  for (const entry of obj.widgets) {
    if (!entry || typeof entry !== 'object') {
      throw new Error(`${manifestPath}: each widget must be an object`);
    }
    const w = entry as Record<string, unknown>;

    if (typeof w.id !== 'string' || !w.id) {
      throw new Error(`${manifestPath}: widget id must be a non-empty string`);
    }
    if (ids.has(w.id)) {
      throw new Error(`${manifestPath}: duplicate widget id "${w.id}"`);
    }
    ids.add(w.id);

    if (w.type === 'lvar-bool') {
      if (typeof w.lvar !== 'string' || !w.lvar) {
        throw new Error(`${manifestPath}: widget "${w.id}" lvar must be a non-empty string`);
      }
      if (typeof w.on !== 'number' || typeof w.off !== 'number') {
        throw new Error(`${manifestPath}: widget "${w.id}" must include numeric on and off`);
      }
      widgets.push({
        id: w.id,
        type: 'lvar-bool',
        lvar: lvarDatumName(w.lvar).slice(2),
        on: w.on,
        off: w.off,
      });
      continue;
    }

    if (w.type !== 'bool') {
      throw new Error(
        `${manifestPath}: widget "${w.id}" type must be "bool" or "lvar-bool"`,
      );
    }

    const read = w.read as Record<string, unknown> | undefined;
    if (
      !read ||
      typeof read.name !== 'string' ||
      !read.name ||
      typeof read.unit !== 'string' ||
      !read.unit ||
      typeof read.datum !== 'string' ||
      !ALLOWED_DATUMS.has(read.datum)
    ) {
      throw new Error(
        `${manifestPath}: widget "${w.id}" read must include name, unit, and datum "int32"`,
      );
    }

    const write = w.write as Record<string, unknown> | undefined;
    if (
      !write ||
      typeof write.event !== 'string' ||
      !write.event ||
      typeof write.on !== 'number' ||
      typeof write.off !== 'number'
    ) {
      throw new Error(
        `${manifestPath}: widget "${w.id}" write must include event, on, and off numbers`,
      );
    }

    widgets.push({
      id: w.id,
      type: 'bool',
      read: {
        name: read.name,
        unit: read.unit,
        datum: 'int32',
      },
      write: {
        event: write.event,
        on: write.on,
        off: write.off,
      },
    });
  }

  return { version: 1, widgets };
}

export function lvarSimName(widget: LvarBoolWidget): string {
  return `L:${widget.lvar}`;
}