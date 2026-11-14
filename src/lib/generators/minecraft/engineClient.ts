import type { EngineScanRequest, EngineScanResult } from './engine.types';

/*
 * Main-thread client for the cubiomes worldgen worker.
 * The worker is created lazily so SSR never pays for it.
 */

type WorkerReply =
  | ({ id: number; ok: true } & EngineScanResult)
  | { id: number; ok: false; error?: string };

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<
  number,
  { resolve: (result: EngineScanResult) => void; reject: (error: Error) => void }
>();

function failAll(error: Error) {
  for (const [, p] of pending) p.reject(error);
  pending.clear();
}

function ensureWorker(): Worker {
  if (worker) return worker;
  const w = new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' });
  w.onmessage = (event: MessageEvent<WorkerReply>) => {
    const msg = event.data;
    if (!msg || typeof msg.id !== 'number') return;
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    if (msg.ok) {
      p.resolve({
        spots: msg.spots,
        biomePixels: msg.biomePixels,
        biomeMeta: msg.biomeMeta,
      });
    } else {
      p.reject(new Error(msg.error || 'worldgen worker failed'));
    }
  };
  w.onerror = (event) => {
    failAll(new Error(event.message || 'worldgen worker crashed'));
    try {
      w.terminate();
    } catch {}
    if (worker === w) worker = null;
  };
  w.onmessageerror = () => failAll(new Error('worldgen worker message error'));
  worker = w;
  return w;
}

export function scanWorld(request: EngineScanRequest): Promise<EngineScanResult> {
  const w = ensureWorker();
  const id = ++seq;
  return new Promise<EngineScanResult>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    try {
      w.postMessage({ ...request, id });
    } catch (error) {
      pending.delete(id);
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

export function disposeEngine() {
  if (worker) {
    try {
      worker.terminate();
    } catch {}
    worker = null;
  }
  failAll(new Error('worldgen worker disposed'));
}
