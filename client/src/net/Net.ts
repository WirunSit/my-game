import type { ClientMessage, ServerMessage } from '@sciboom/shared';

/** Address of the PvP server: the same host the game came from (Vite forwards /ws while developing) */
function socketUrl(): string {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}/ws`;
}

/**
 * WebSocket connection to the PvP server. Messages are queued in arrival
 * order; scenes read them one at a time with next(), so nothing is missed
 * while an animation is playing.
 */
export class Net {
  id = '';
  onClose: () => void = () => {};
  private readonly queue: ServerMessage[] = [];
  private waiter: ((m: ServerMessage) => void) | null = null;
  private closed = false;

  private constructor(private readonly ws: WebSocket) {
    ws.addEventListener('message', (e) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(String(e.data)) as ServerMessage;
      } catch {
        return;
      }
      const w = this.waiter;
      if (w) {
        this.waiter = null;
        w(msg);
      } else {
        this.queue.push(msg);
      }
    });
    ws.addEventListener('close', () => {
      if (this.closed) return;
      this.closed = true;
      this.onClose();
    });
  }

  /** Connect and wait for the server's welcome (rejects after `timeoutMs`) */
  static connect(timeoutMs = 8000): Promise<Net> {
    return new Promise((resolve, reject) => {
      let ws: WebSocket;
      try {
        ws = new WebSocket(socketUrl());
      } catch (e) {
        reject(e);
        return;
      }
      const net = new Net(ws);
      const timer = setTimeout(() => {
        ws.close();
        reject(new Error('timeout'));
      }, timeoutMs);
      ws.addEventListener('error', () => {
        clearTimeout(timer);
        reject(new Error('cannot connect'));
      });
      net.next().then((m) => {
        clearTimeout(timer);
        if (m.t === 'welcome') {
          net.id = m.id;
          resolve(net);
        } else {
          reject(new Error('unexpected reply'));
        }
      });
    });
  }

  get isOpen(): boolean {
    return !this.closed && this.ws.readyState === WebSocket.OPEN;
  }

  send(msg: ClientMessage) {
    if (this.isOpen) this.ws.send(JSON.stringify(msg));
  }

  /** The next message from the server (waits if none has arrived yet) */
  next(): Promise<ServerMessage> {
    const m = this.queue.shift();
    if (m) return Promise.resolve(m);
    return new Promise((resolve) => (this.waiter = resolve));
  }

  close() {
    this.closed = true;
    this.ws.close();
  }
}
