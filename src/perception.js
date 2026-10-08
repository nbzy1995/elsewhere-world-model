// Browser-side object perception. Frames stay local; only public model files are downloaded.
let worker, nextId = 0;
const pending = new Map(), progressListeners = new Set();

function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./perception.worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data }) => {
    if (data.type === 'progress') { for (const listener of progressListeners) listener(data.message); return; }
    const request = pending.get(data.id); if (!request) return;
    pending.delete(data.id); clearTimeout(request.timer);
    if (data.error) request.reject(new Error(data.error)); else request.resolve(data.result);
  };
  worker.onerror = event => {
    const message = event.message || 'Local object perception worker failed.';
    for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error(message)); }
    pending.clear(); worker?.terminate(); worker = null;
  };
  return worker;
}

function request(type, payload = {}) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => {
      pending.delete(id); reject(new Error('Object perception timed out. Try selecting again after model loading finishes.'));
    }, 240000);
    pending.set(id, { resolve, reject, timer });
    try { getWorker().postMessage({ id, type, ...payload }); }
    catch (error) { clearTimeout(timer); pending.delete(id); reject(error); }
  });
}

/** Loads quantized SlimSAM and CLIP in a worker. Progress messages are readable strings. */
export async function warmup(onProgress) {
  if (onProgress) progressListeners.add(onProgress);
  try { return await request('warmup'); }
  finally { if (onProgress) progressListeners.delete(onProgress); }
}

/** Returns an actual SAM output mask; confidence is CLIP's relative label score, not calibration. */
export function selectObject(imageDataUrl, point) {
  if (typeof imageDataUrl !== 'string' || !imageDataUrl.startsWith('data:image/')) return Promise.reject(new Error('Select from a captured image frame.'));
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) return Promise.reject(new Error('Object selection needs an image point between 0 and 1.'));
  return request('select', { imageDataUrl, point });
}

export function disposePerception() {
  worker?.terminate(); worker = null;
  for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error('Object perception stopped.')); }
  pending.clear(); progressListeners.clear();
}
