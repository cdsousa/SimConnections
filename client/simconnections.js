// Bundled runtime: WebSocket bridge for panel widgets (bool + lvar enum).

const statusEl = document.querySelector('[data-sc-status]');
const widgetInputs = new Map();
/** @type {Map<string, { buttons: HTMLButtonElement[] }>} */
const widgetEnums = new Map();

for (const input of document.querySelectorAll('[data-sc-widget]')) {
  const id = input.getAttribute('data-sc-widget');
  if (!id) continue;
  if (input instanceof HTMLInputElement && input.type === 'checkbox') {
    widgetInputs.set(id, input);
  }
}

for (const root of document.querySelectorAll('[data-sc-type="enum"]')) {
  const id = root.getAttribute('data-sc-widget');
  if (!id) continue;
  const buttons = [...root.querySelectorAll('button[data-sc-value]')].filter(
    (b) => b instanceof HTMLButtonElement,
  );
  if (buttons.length) widgetEnums.set(id, { buttons });
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
  for (const { buttons } of widgetEnums.values()) {
    for (const btn of buttons) btn.disabled = !enabled;
  }
}

function labelFor(input, on) {
  const onText = input.getAttribute('data-sc-on') ?? 'Set';
  const offText = input.getAttribute('data-sc-off') ?? 'Released';
  return on ? onText : offText;
}

function applyEnumValue(buttons, raw) {
  for (const btn of buttons) {
    const target = Number(btn.getAttribute('data-sc-value'));
    const active = Math.abs(raw - target) < 0.001;
    btn.classList.toggle('enum__btn--active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  }
}

function applyValues(widgets) {
  if (!widgets || typeof widgets !== 'object') return;
  for (const [id, input] of widgetInputs) {
    if (typeof widgets[id] === 'boolean') {
      input.checked = widgets[id];
      const textEl = input.closest('label')?.querySelector('.toggle__text');
      if (textEl) textEl.textContent = labelFor(input, widgets[id]);
    }
  }
  for (const [id, { buttons }] of widgetEnums) {
    if (typeof widgets[id] === 'number') {
      applyEnumValue(buttons, widgets[id]);
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
    if (textEl) textEl.textContent = labelFor(input, input.checked);
  });
}

for (const [id, { buttons }] of widgetEnums) {
  for (const btn of buttons) {
    btn.addEventListener('click', () => {
      if (!ws || ws.readyState !== WebSocket.OPEN || btn.disabled) return;
      const value = Number(btn.getAttribute('data-sc-value'));
      if (!Number.isFinite(value)) return;
      ws.send(JSON.stringify({ type: 'set', id, value }));
      applyEnumValue(buttons, value);
    });
  }
}

connect();