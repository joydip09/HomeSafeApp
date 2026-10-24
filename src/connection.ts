import { Envelope, parseMessage, validSnapshot } from './protocol';
export type Link =
  | 'disconnected'
  | 'connecting'
  | 'awaiting_snapshot'
  | 'synchronized'
  | 'error';
export class DeviceConnection {
  private socket: WebSocket | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private attempts = 0;
  private stopped = true;
  private url = '';
  private reconnect = true;
  onStatus: (s: Link, error?: string) => void = () => {};
  onMessage: (m: Envelope) => void = () => {};
  connect(url: string, reconnect: boolean) {
    this.disconnect();
    this.url = url;
    this.reconnect = reconnect;
    this.stopped = false;
    this.open();
  }
  private open() {
    if (this.stopped) return;
    this.onStatus('connecting');
    try {
      const ws = new WebSocket(this.url);
      this.socket = ws;
      ws.onopen = () => {
        this.attempts = 0;
        this.onStatus('awaiting_snapshot');
      };
      ws.onmessage = e => {
        const m = parseMessage(String(e.data));
        if (!m) {
          this.onStatus('error', 'Invalid protocol message received');
          return;
        }
        if (m.type === 'state_snapshot') {
          if (!validSnapshot(m)) {
            this.onStatus('error', 'Malformed state snapshot');
            return;
          }
          this.onStatus('synchronized');
        }
        this.onMessage(m);
      };
      ws.onerror = () => this.onStatus('error', 'WebSocket connection error');
      ws.onclose = () => {
        this.socket = null;
        if (!this.stopped) {
          this.onStatus('disconnected', 'Connection closed');
          this.retry();
        }
      };
    } catch (e) {
      this.onStatus('error', String(e));
      this.retry();
    }
  }
  private retry() {
    if (!this.reconnect || this.stopped || this.timer) return;
    const base = Math.min(30000, 1000 * 2 ** this.attempts++);
    const delay = Math.round(base * (0.8 + Math.random() * 0.4));
    this.timer = setTimeout(() => {
      this.timer = null;
      this.open();
    }, delay);
  }
  send(value: object) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN)
      throw new Error('Device is not connected');
    this.socket.send(JSON.stringify(value));
  }
  disconnect() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const ws = this.socket;
    this.socket = null;
    if (ws) {
      ws.onclose = null;
      ws.close();
    }
    this.onStatus('disconnected');
  }
}
