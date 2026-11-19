// Browser UI: WebSocket to this server; server owns the SimConnect session.
const statusEl = document.getElementById('status');
const toggle = document.getElementById('controlToggle');
const toggleText = document.querySelector('.toggle__text');

let ws;
let reconnectDelay = 1000;

function setStatus(className, text) {
  statusEl.className = `status ${className}`;
  statusEl.textContent = text;
}

function applyState(on) {
  toggle.checked = on;
  toggleText.textContent = on ? 'Set' : 'Released';
}

function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/ws`);

  ws.addEventListener('open', () => {
    reconnectDelay = 1000;
    setStatus('status--waiting', 'Waiting for simulator…');
  });

  ws.addEventListener('close', () => {
    toggle.disabled = true;
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
      toggle.disabled = !msg.connected;
      setStatus(
        msg.connected ? 'status--ok' : 'status--waiting',
        msg.connected
          ? `Connected to sim${msg.sim ? ` (${msg.sim})` : ''}`
          : 'Waiting for simulator…',
      );
      return;
    }

    if (msg.type === 'state' && typeof msg.on === 'boolean') {
      applyState(msg.on);
    }
  });
}

toggle.addEventListener('change', () => {
  if (!ws || ws.readyState !== WebSocket.OPEN || toggle.disabled) return;
  ws.send(JSON.stringify({ type: 'set', on: toggle.checked }));
});

connect();