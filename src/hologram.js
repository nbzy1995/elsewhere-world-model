// Detect an authored cyan display frame from its visible pixels. No scene coordinates.
// Returns null unless a connected, closed frame contains the requested point.
export function pickHologram(source, point) {
  const started = performance.now();
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) return null;
  const width = Math.min(720, source.width), height = Math.round(source.height * width / source.width);
  if (!width || !height) return null;
  const canvas = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(width, height) : Object.assign(document.createElement('canvas'), { width, height });
  const context = canvas.getContext('2d', { willReadFrequently: true }); context.drawImage(source, 0, 0, width, height);
  const rgba = context.getImageData(0, 0, width, height).data, cyan = new Uint8Array(width * height);
  for (let i = 0; i < cyan.length; i++) { const r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2]; cyan[i] = g > 145 && b > 165 && g - r > 25 && b - r > 35 && Math.abs(g - b) < 85 ? 1 : 0; }
  const px = Math.min(width - 1, Math.floor(point.x * width)), py = Math.min(height - 1, Math.floor(point.y * height));
  for (const radius of [1, 2]) {
    const barrier = new Uint8Array(cyan.length);
    // Close sub-pixel gaps in glowing photographed line edges, bounded to 1–2 pixels.
    for (let y = radius; y < height - radius; y++) for (let x = radius; x < width - radius; x++) if (cyan[y * width + x]) {
      for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) barrier[(y + dy) * width + x + dx] = 1;
    }
    const seen = new Uint8Array(cyan.length), queue = new Int32Array(cyan.length), components = [];
    for (let start = 0; start < barrier.length; start++) {
      if (!barrier[start] || seen[start]) continue;
      let head = 0, tail = 1, x1 = width, y1 = height, x2 = 0, y2 = 0; queue[0] = start; seen[start] = 1;
      while (head < tail) {
        const i = queue[head++], x = i % width, y = Math.floor(i / width); x1 = Math.min(x1, x); y1 = Math.min(y1, y); x2 = Math.max(x2, x); y2 = Math.max(y2, y);
        for (const j of [x ? i - 1 : -1, x < width - 1 ? i + 1 : -1, y ? i - width : -1, y < height - 1 ? i + width : -1]) if (j >= 0 && barrier[j] && !seen[j]) { seen[j] = 1; queue[tail++] = j; }
      }
      const w = x2 - x1 + 1, h = y2 - y1 + 1;
      if (tail < 60 || w < 45 || h < 35 || w / h < .55 || w / h > 2.8 || px < x1 || px > x2 || py < y1 || py > y2 || w * h > width * height * .65) continue;
      components.push({ pixels: queue.slice(0, tail), x1, y1, x2, y2, w, h });
    }
    for (const component of components.sort((a, b) => b.w * b.h - a.w * a.h)) {
      const { x1, y1, x2, y2, w, h, pixels } = component, lw = w + 2, lh = h + 2;
      const local = new Uint8Array(lw * lh), outside = new Uint8Array(local.length), flood = new Int32Array(local.length);
      for (const i of pixels) local[(Math.floor(i / width) - y1 + 1) * lw + i % width - x1 + 1] = 1;
      let head = 0, tail = 1; flood[0] = 0; outside[0] = 1;
      while (head < tail) {
        const i = flood[head++], x = i % lw, y = Math.floor(i / lw);
        for (const j of [x ? i - 1 : -1, x < lw - 1 ? i + 1 : -1, y ? i - lw : -1, y < lh - 1 ? i + lw : -1]) if (j >= 0 && !local[j] && !outside[j]) { outside[j] = 1; flood[tail++] = j; }
      }
      if (outside[(py - y1 + 1) * lw + px - x1 + 1]) continue;
      const mask = new Uint8Array(width * height); let area = 0, enclosed = 0;
      const corners = [null, null, null, null], extrema = [Infinity, -Infinity, -Infinity, Infinity];
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const localIndex = (y + 1) * lw + x + 1; if (outside[localIndex]) continue;
        const gx = x + x1, gy = y + y1; mask[gy * width + gx] = 1; area++; if (!local[localIndex]) enclosed++;
        const sum = gx + gy, difference = gx - gy;
        if (sum < extrema[0]) { extrema[0] = sum; corners[0] = [gx, gy]; }
        if (difference > extrema[1]) { extrema[1] = difference; corners[1] = [gx, gy]; }
        if (sum > extrema[2]) { extrema[2] = sum; corners[2] = [gx, gy]; }
        if (difference < extrema[3]) { extrema[3] = difference; corners[3] = [gx, gy]; }
      }
      if (enclosed < w * h * .25 || area < width * height * .008 || area / (w * h) < .55) continue;
      let supported = 0, samples = 0;
      for (let edge = 0; edge < 4; edge++) {
        const a = corners[edge], b = corners[(edge + 1) % 4];
        for (let step = 0; step <= 40; step++) {
          const x = Math.round(a[0] + (b[0] - a[0]) * step / 40), y = Math.round(a[1] + (b[1] - a[1]) * step / 40); let found = false;
          for (let dy = -3; dy <= 3 && !found; dy++) for (let dx = -3; dx <= 3; dx++) if (x + dx >= 0 && x + dx < width && y + dy >= 0 && y + dy < height && cyan[(y + dy) * width + x + dx]) { found = true; break; }
          samples++; if (found) supported++;
        }
      }
      const edgeSupport = supported / samples; if (edgeSupport < .78) continue;
      return { mask, width, height, bbox: { x: x1 / width, y: y1 / height, w: w / width, h: h / height }, label: 'computer', confidence: edgeSupport, elapsedMs: performance.now() - started, source: 'detected-cyan-frame', confidenceMeaning: 'fraction of fitted boundary samples supported by visible cyan pixels', enclosedPixels: enclosed };
    }
  }
  return null;
}
