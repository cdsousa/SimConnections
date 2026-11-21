// Bundled runtime: WebSocket bridge for panel widgets (v1: bool checkboxes).

const statusEl = document.querySelector('[data-sc-status]');
const widgetInputs = new Map();

for (const input of document.querySelectorAll('[data-sc-widget]')) {
  const id = input.getAttribute('data-sc-widget');
  if (!id) continue;
  if (input instanceof HTMLInputElement && input.type === 'checkbox') {
    widgetInputs.set(id, input);
  }
}

let ws;
let reconnectDelay = 1000;

function setStatus(className, text) {
  if (!statusEl) return;
  statusEl.className = `status ${className}`;
  statusEl.textContent = text;
}

function setWidgetsEnabled(enabled) {
  for (const input of widgetInputs.values()) {
    input.disabled = !enabled;
  }
}

function applyValues(widgets) {
  if (!widgets || typeof widgets !== 'object') return;
  for (const [id, input] of widgetInputs) {
    if (typeof widgets[id] === 'boolean') {
      input.checked = widgets[id];
      const label = input.closest('label');
      const textEl = label?.querySelector('.toggle__text');
      if (textEl) {
        textEl.textContent = widgets[id] ? 'Set' : 'Released';
      }
    }
  }
}

function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/ws`);

  ws.addEventListener('open', () => {
    reconnectDelay = 1000;
    setWidgetsEnabled(false);
    setStatus('status--waiting', 'Waiting for simulator…');
  });

  ws.addEventListener('close', () => {
    setWidgetsEnabled(false);
    setStatus('status--error', 'Server connection lost — retrying…');
    setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 1.5, 10000);
  });

  ws.addEventListener('message', (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }

    if (msg.type === 'status') {
      setWidgetsEnabled(Boolean(msg.connected));
      setStatus(
        msg.connected ? 'status--ok' : 'status--waiting',
        msg.connected
          ? `Connected to sim${msg.sim ? ` (${msg.sim})` : ''}`
          : 'Waiting for simulator…',
      );
      return;
    }

    if (msg.type === 'values') {
      applyValues(msg.widgets);
    }
  });
}

for (const [id, input] of widgetInputs) {
  input.addEventListener('change', () => {
    if (!ws || ws.readyState !== WebSocket.OPEN || input.disabled) return;
    ws.send(JSON.stringify({ type: 'set', id, value: input.checked }));
    const textEl = input.closest('label')?.querySelector('.toggle__text');
    if (textEl) {
      textEl.textContent = input.checked ? 'Set' : 'Released';
    }
  });
}

connect();