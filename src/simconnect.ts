import { EventEmitter } from 'node:events';
import {
  EventFlag,
  open,
  Protocol,
  SimConnectConstants,
  SimConnectDataType,
  SimConnectPeriod,
  type RecvOpen,
  type SimConnectConnection,
} from 'node-simconnect';

const DEFINITION_ID = 1;
const REQUEST_ID = 1;
const CLIENT_EVENT_PARKING_BRAKE_SET = 1;
const NOTIFICATION_GROUP = 1;
const RECONNECT_MS = 5000;

export type SimStatus = {
  connected: boolean;
  applicationName?: string;
};

export type ControlState = {
  on: boolean;
};

/** TCP SimConnect client: parking brake demo (change bindSession to try other controls). */
export class SimConnections extends EventEmitter {
  private handle: SimConnectConnection | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private simIsQuitting = false;
  private connecting = false;

  constructor(
    private readonly host: string,
    private readonly port: number,
  ) {
    super();
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

  /** Write: K:PARKING_BRAKE_SET with 0 = release, 1 = set. */
  setControl(on: boolean): void {
    if (!this.handle) return;
    this.handle.transmitClientEvent(
      SimConnectConstants.OBJECT_ID_USER,
      CLIENT_EVENT_PARKING_BRAKE_SET,
      on ? 1 : 0,
      NOTIFICATION_GROUP,
      EventFlag.EVENT_FLAG_GROUPID_IS_PRIORITY,
    );
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
    // Outbound: map our client event id → sim key event name.
    handle.mapClientEventToSimEvent(
      CLIENT_EVENT_PARKING_BRAKE_SET,
      'PARKING_BRAKE_SET',
    );

    // Inbound: MSFS pushes this definition once per sim second (not a Node poll loop).
    handle.addToDataDefinition(
      DEFINITION_ID,
      'BRAKE PARKING POSITION',
      'bool',
      SimConnectDataType.INT32,
    );
    handle.requestDataOnSimObject(
      REQUEST_ID,
      DEFINITION_ID,
      SimConnectConstants.OBJECT_ID_USER,
      SimConnectPeriod.SECOND,
    );

    this.emit('status', {
      connected: true,
      applicationName: recvOpen.applicationName,
    });

    handle.on('simObjectData', (data) => {
      if (data.requestID !== REQUEST_ID) return;
      this.emit('state', { on: data.data.readInt32() === 1 });
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