import { EventEmitter } from 'node:events';
import {
  EventFlag,
  open,
  Protocol,
  RawBuffer,
  SimConnectConstants,
  SimConnectDataType,
  SimConnectPeriod,
  type RecvOpen,
  type SimConnectConnection,
} from 'node-simconnect';
import {
  type BoolWidget,
  type LvarBoolWidget,
  type PanelManifest,
  type PanelWidget,
  lvarSimName,
} from './panel.js';

const NOTIFICATION_GROUP = 1;
const RECONNECT_MS = 5000;
const FIRST_DEFINITION_ID = 1;
const FIRST_REQUEST_ID = 1;
const FIRST_CLIENT_EVENT_ID = 1;

export type SimStatus = {
  connected: boolean;
  applicationName?: string;
};

export type WidgetValues = Record<string, boolean>;

type EventWriteBinding = {
  kind: 'event';
  widgetId: string;
  clientEventId: number;
  on: number;
  off: number;
};

type LvarWriteBinding = {
  kind: 'lvar';
  widgetId: string;
  definitionId: number;
  on: number;
  off: number;
};

type WriteBinding = EventWriteBinding | LvarWriteBinding;

function isBoolWidget(w: PanelWidget): w is BoolWidget {
  return w.type === 'bool';
}

function isLvarBoolWidget(w: PanelWidget): w is LvarBoolWidget {
  return w.type === 'lvar-bool';
}

/** TCP SimConnect client driven by a panel manifest. */
export class PanelSimSession extends EventEmitter {
  private handle: SimConnectConnection | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private simIsQuitting = false;
  private connecting = false;
  private readonly widgetsById = new Map<string, PanelWidget>();
  private readonly requestToWidget = new Map<number, string>();
  private readonly requestIsLvar = new Map<number, boolean>();
  private readonly writeByWidgetId = new Map<string, WriteBinding>();
  private readonly lvarOnValues = new Map<string, number>();
  private lastValues: WidgetValues = {};

  constructor(
    private readonly host: string,
    private readonly port: number,
    manifest: PanelManifest,
  ) {
    super();
    for (const widget of manifest.widgets) {
      this.widgetsById.set(widget.id, widget);
      if (isLvarBoolWidget(widget)) {
        this.lvarOnValues.set(widget.id, widget.on);
      }
    }
  }

  start(): void {
    this.connect();
  }

  stop(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.simIsQuitting = true;
    this.handle?.close();
    this.handle = null;
  }

  getValues(): WidgetValues {
    return { ...this.lastValues };
  }

  setWidget(widgetId: string, value: boolean): void {
    if (!this.handle) return;
    const binding = this.writeByWidgetId.get(widgetId);
    if (!binding) return;

    if (binding.kind === 'event') {
      this.handle.transmitClientEvent(
        SimConnectConstants.OBJECT_ID_USER,
        binding.clientEventId,
        value ? binding.on : binding.off,
        NOTIFICATION_GROUP,
        EventFlag.EVENT_FLAG_GROUPID_IS_PRIORITY,
      );
      return;
    }

    const payload = new RawBuffer(16);
    payload.writeFloat64(value ? binding.on : binding.off);
    this.handle.setDataOnSimObject(binding.definitionId, SimConnectConstants.OBJECT_ID_USER, {
      buffer: payload,
      arrayCount: 0,
      tagged: false,
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.emit('status', { connected: false });
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, RECONNECT_MS);
  }

  private connect(): void {
    if (this.connecting) return;
    this.connecting = true;
    this.handle?.close();
    this.handle = null;
    this.requestToWidget.clear();
    this.requestIsLvar.clear();
    this.writeByWidgetId.clear();

    open('SimConnections', Protocol.SunRise, {
      host: this.host,
      port: this.port,
    })
      .then(({ recvOpen, handle }) => {
        this.connecting = false;
        this.simIsQuitting = false;
        this.handle = handle;
        this.bindSession(recvOpen, handle);
      })
      .catch((error: Error) => {
        this.connecting = false;
        console.error('SimConnect connect failed:', error.message);
        this.scheduleReconnect();
      });
  }

  private bindSession(recvOpen: RecvOpen, handle: SimConnectConnection): void {
    let definitionId = FIRST_DEFINITION_ID;
    let requestId = FIRST_REQUEST_ID;

    for (const widget of this.widgetsById.values()) {
      if (isBoolWidget(widget)) {
        handle.addToDataDefinition(
          definitionId,
          widget.read.name,
          widget.read.unit,
          SimConnectDataType.INT32,
        );
        this.requestIsLvar.set(requestId, false);
      } else if (isLvarBoolWidget(widget)) {
        handle.addToDataDefinition(
          definitionId,
          lvarSimName(widget),
          'Number',
          SimConnectDataType.FLOAT64,
        );
        this.requestIsLvar.set(requestId, true);
        this.writeByWidgetId.set(widget.id, {
          kind: 'lvar',
          widgetId: widget.id,
          definitionId,
          on: widget.on,
          off: widget.off,
        });
      }

      handle.requestDataOnSimObject(
        requestId,
        definitionId,
        SimConnectConstants.OBJECT_ID_USER,
        SimConnectPeriod.SECOND,
      );
      this.requestToWidget.set(requestId, widget.id);
      definitionId++;
      requestId++;
    }

    const eventNameToClientId = new Map<string, number>();
    let nextClientEventId = FIRST_CLIENT_EVENT_ID;

    for (const widget of this.widgetsById.values()) {
      if (!isBoolWidget(widget)) continue;

      const eventName = widget.write.event;
      let clientEventId = eventNameToClientId.get(eventName);
      if (clientEventId === undefined) {
        clientEventId = nextClientEventId;
        nextClientEventId++;
        eventNameToClientId.set(eventName, clientEventId);
        handle.mapClientEventToSimEvent(clientEventId, eventName);
      }
      this.writeByWidgetId.set(widget.id, {
        kind: 'event',
        widgetId: widget.id,
        clientEventId,
        on: widget.write.on,
        off: widget.write.off,
      });
    }

    this.emit('status', {
      connected: true,
      applicationName: recvOpen.applicationName,
    });

    handle.on('simObjectData', (data) => {
      const widgetId = this.requestToWidget.get(data.requestID);
      if (!widgetId) return;

      let value: boolean;
      if (this.requestIsLvar.get(data.requestID)) {
        const raw = data.data.readFloat64();
        const onVal = this.lvarOnValues.get(widgetId) ?? 1;
        value = Math.abs(raw - onVal) < 0.001;
      } else {
        value = data.data.readInt32() === 1;
      }

      this.lastValues[widgetId] = value;
      this.emit('values', { ...this.lastValues });
    });

    handle.on('exception', (ex) => console.warn('SimConnect exception:', ex));
    handle.on('quit', () => {
      this.simIsQuitting = true;
      handle.close();
      this.handle = null;
      this.scheduleReconnect();
    });
    handle.on('close', () => {
      if (this.simIsQuitting) return;
      this.handle = null;
      this.scheduleReconnect();
    });
    handle.on('error', (err: Error) => console.error('SimConnect error:', err.message));
  }
}