import { warmup, selectObject, disposePerception } from './perception.js';
import { pickHologram } from './hologram.js';

const $ = id => document.getElementById(id);
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const choices = {
  computer: [['computer', 'Use computer'], ['inspect', 'Look closer']],
  vehicle: [['drive', 'Get in'], ['inspect', 'Look closer']],
  person: [['talk', 'Greet'], ['inspect', 'Look closer']],
  door: [['use', 'Open'], ['inspect', 'Look closer']],
  robot: [['bench', 'Work on robot'], ['inspect', 'Look closer']],
  tool: [['take', 'Pick up'], ['use', 'Use'], ['inspect', 'Look closer']],
};
const names = { computer: 'Computer', vehicle: 'Vehicle', person: 'Person', door: 'Door', robot: 'Robot', tool: 'Tool / part' };

// Selection is performed on a held video frame. No fabricated object geometry.
export function createObjectInteraction({ canvas, holdWorld, onAction, onComputerReady, onComputerExit, onError, onUnavailable = () => {} }) {
  let selection = null, epoch = 0, release = null, computer = null, prepared = null;
  const card = $('selectionCard');
  const snapshot = () => { const frame = document.createElement('canvas'); frame.width = canvas.width; frame.height = canvas.height; frame.getContext('2d').drawImage(canvas, 0, 0); return frame; };
  const acquire = () => { if (!release) release = holdWorld(); };
  async function releaseHold() { const restore = release; release = null; if (restore) await restore(); }
  function prepare() {
    if (!prepared) prepared = warmup(message => { if (selection?.pending) $('selectionStatus').textContent = message; }).catch(error => { prepared = null; throw error; });
    return prepared;
  }
  function positionCard() {
    if (!selection) return;
    const rect = canvas.getBoundingClientRect(), scale = Math.max(rect.width / canvas.width, rect.height / canvas.height);
    const w = canvas.width * scale, h = canvas.height * scale;
    const bounds = selection.bbox || { x: selection.point.x, y: selection.point.y, w: 0, h: 0 };
    const x = (bounds.x + bounds.w) * w - (w - rect.width) / 2;
    const y = bounds.y * h - (h - rect.height) / 2;
    const left = x + 22 + 230 < rect.width ? x + 22 : bounds.x * w - (w - rect.width) / 2 - 252;
    card.style.left = clamp(left, 18, Math.max(18, rect.width - 248)) + 'px';
    card.style.top = clamp(y, 90, Math.max(90, rect.height - card.offsetHeight - 28)) + 'px';
  }
  function renderActions() {
    $('selectionActions').replaceChildren();
    if (!selection || selection.pending) return;
    const label = selection.label;
    $('selectionName').textContent = names[label] || 'Object';
    for (const [index, [action, title]] of choices[label].entries()) {
      const button = document.createElement('button'); button.dataset.play = action;
      const icon = document.createElement('kbd'); icon.textContent = index === 0 ? 'E' : '↗';
      const text = document.createElement('span'); text.textContent = title;
      button.append(icon, text); button.addEventListener('click', () => void act(action));
      $('selectionActions').append(button);
    }
    positionCard();
  }
  function makeOutline({ mask, width, height }) {
    const layer = document.createElement('canvas'); layer.width = width; layer.height = height;
    const context = layer.getContext('2d'), image = context.createImageData(width, height);
    // Fill enclosed mask holes before outlining, so images within a screen do not
    // create extra selected contours. The outer boundary still comes from SAM.
    const outside = new Uint8Array(width * height), queue = new Int32Array(width * height); let head = 0, tail = 0;
    const visit = i => { if (!mask[i] && !outside[i]) { outside[i] = 1; queue[tail++] = i; } };
    for (let x = 0; x < width; x++) { visit(x); visit((height - 1) * width + x); }
    for (let y = 0; y < height; y++) { visit(y * width); visit(y * width + width - 1); }
    while (head < tail) { const i = queue[head++], x = i % width; if (x) visit(i - 1); if (x < width - 1) visit(i + 1); if (i >= width) visit(i - width); if (i < width * (height - 1)) visit(i + width); }
    const silhouette = outside.map(value => value ? 0 : 1);
    const radius = Math.max(1, Math.round(width / 550));
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = y * width + x; if (!silhouette[i]) continue;
      const edge = x < radius || y < radius || x >= width - radius || y >= height - radius || !silhouette[i - radius] || !silhouette[i + radius] || !silhouette[i - radius * width] || !silhouette[i + radius * width];
      image.data.set([225, 251, 191, edge ? 250 : 14], i * 4);
    }
    context.putImageData(image, 0, 0); return layer;
  }
  async function select(point = { x: .5, y: .5 }) {
    if (computer) return;
    const attempt = ++epoch, frame = selection?.frame || snapshot();
    acquire();
    selection = { frame, point: { x: clamp(point.x, 0, 1), y: clamp(point.y, 0, 1) }, pending: true, label: 'object', bbox: null, outline: null };
    document.body.classList.add('selecting'); card.hidden = false; $('selectionName').textContent = 'Selecting…';
    $('selectionStatus').hidden = false; $('selectionStatus').textContent = 'Selecting object…'; $('selectionActions').replaceChildren(); positionCard();
    try {
      // Authored holographic terminals have a visible cyan frame. Detect its
      // actual closed border before general image recognition sees its contents.
      let result = pickHologram(frame, selection.point);
      if (!result) {
        await prepare(); if (attempt !== epoch) return;
        result = await selectObject(frame.toDataURL('image/jpeg', .92), selection.point);
      }
      if (attempt !== epoch) return;
      if (!choices[result.label] || result.maskArea > .7) { await clear(); onUnavailable('Nothing to use here.'); return; }
      Object.assign(selection, { ...result, outline: makeOutline(result), pending: false });
      delete selection.mask;
      $('selectionStatus').hidden = true; renderActions();
    } catch (error) {
      if (attempt !== epoch) return;
      await clear(); onUnavailable('Could not select that object.'); onError(error.message);
    }
  }
  async function clear() {
    ++epoch; selection = null; card.hidden = true; document.body.classList.remove('selecting');
    if (!computer) await releaseHold();
  }
  async function act(action) {
    if (!selection || selection.pending) return;
    if (action === 'computer') { openComputer(); return; }
    const target = { point: { ...selection.point }, label: selection.label, bbox: selection.bbox };
    const attempt = epoch + 1; await clear(); if (epoch !== attempt) return; await onAction(action, target);
  }
  function cropFor(bbox) {
    if (!bbox) return { x: 0, y: 0, w: canvas.width, h: canvas.height };
    const aspect = canvas.width / canvas.height;
    let w = Math.max(bbox.w * canvas.width * 1.22, bbox.h * canvas.height * 1.22 * aspect, canvas.width * .17);
    w = Math.min(w, canvas.width); const h = w / aspect;
    return { x: clamp((bbox.x + bbox.w / 2) * canvas.width - w / 2, 0, canvas.width - w), y: clamp((bbox.y + bbox.h / 2) * canvas.height - h / 2, 0, canvas.height - h), w, h };
  }
  function openComputer(bounds = null) {
    if (computer) return;
    acquire(); ++epoch;
    computer = { frame: selection?.frame || snapshot(), crop: cropFor(bounds || selection?.bbox), phase: 'approach', started: performance.now(), duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 720, progress: 0 };
    selection = null; card.hidden = true; document.body.classList.remove('selecting'); document.body.classList.add('using-computer');
  }
  function closeComputer() {
    if (!computer) return Promise.resolve();
    if (computer.phase === 'return') return computer.closed;
    computer.returnFrom = computer.progress; computer.phase = 'return'; computer.started = performance.now();
    computer.closed = new Promise(resolve => { computer.resolve = resolve; });
    return computer.closed;
  }
  function draw(context, now) {
    if (computer) {
      const progress = clamp((now - computer.started) / computer.duration, 0, 1);
      const eased = progress * progress * (3 - 2 * progress);
      const t = computer.phase === 'return' ? computer.returnFrom * (1 - eased) : computer.phase === 'using' ? 1 : eased;
      computer.progress = t;
      const c = computer.crop;
      context.drawImage(computer.frame, c.x * t, c.y * t, canvas.width + (c.w - canvas.width) * t, canvas.height + (c.h - canvas.height) * t, 0, 0, canvas.width, canvas.height);
      if (progress === 1 && computer.phase === 'approach') { computer.phase = 'using'; onComputerReady(); }
      else if (progress === 1 && computer.phase === 'return') {
        const resolve = computer.resolve; computer = null; document.body.classList.remove('using-computer');
        void releaseHold().finally(() => { onComputerExit(); resolve?.(); });
      }
      return true;
    }
    if (!selection) return false;
    context.drawImage(selection.frame, 0, 0, canvas.width, canvas.height);
    if (selection.outline) context.drawImage(selection.outline, 0, 0, canvas.width, canvas.height);
    if (selection.pending) {
      context.strokeStyle = '#e2ffb1'; context.lineWidth = 2; context.beginPath();
      context.arc(selection.point.x * canvas.width, selection.point.y * canvas.height, 14, now / 300, now / 300 + Math.PI * 1.5); context.stroke();
    }
    return true;
  }
  function reset() {
    ++epoch; const resolve = computer?.resolve; computer = null; selection = null; resolve?.(); card.hidden = true;
    document.body.classList.remove('using-computer', 'selecting'); void releaseHold();
  }
  $('selectionClose').addEventListener('click', () => { void clear(); canvas.focus(); });
  window.addEventListener('resize', positionCard);
  return { select, clear, reset, draw, openComputer, closeComputer, prepare,
    primary: () => { if (selection && !selection.pending && choices[selection.label]) void act(choices[selection.label][0][0]); },
    get selected() { return !!selection; }, get active() { return !!selection || !!computer; }, get usingComputer() { return !!computer; },
    getState: () => ({ selection: selection ? { point: selection.point, label: selection.label, pending: selection.pending, bbox: selection.bbox, outlined: !!selection.outline, elapsedMs: selection.elapsedMs, source: selection.source || 'local-segmentation', error: selection.error } : null, computer: computer ? { phase: computer.phase, progress: computer.progress, crop: computer.crop } : null }),
    dispose: () => { reset(); disposePerception(); window.removeEventListener('resize', positionCard); },
  };
}
