import { SamModel, AutoProcessor, RawImage, Tensor, pipeline, env } from '@huggingface/transformers';

env.allowLocalModels = false;
env.useBrowserCache = true;
env.backends.onnx.wasm.numThreads = 1; // Works without cross-origin-isolation headers.
env.backends.onnx.wasm.proxy = false; // This module is already a dedicated worker.

const SAM = 'Xenova/slimsam-77-uniform', CLIP = 'Xenova/clip-vit-base-patch32';
const labels = {
  computer: 'an LCD computer display showing software, text or a 3D model', vehicle: 'a road vehicle or spacecraft',
  person: 'a person', tool: 'an electric motor or a loose mechanical part', door: 'an architectural door or doorway',
  robot: 'a real robot arm standing on a workbench', object: 'an ordinary object or piece of furniture',
};
const labelPrompts = [...Object.entries(labels), ['computer', 'a holographic computer display with a software interface'], ['robot', 'a physical humanoid robot with a mechanical body']];
let sam, processor, classifier, loading, imageCache, classificationError = '', device = 'wasm', queue = Promise.resolve();
const progress = message => self.postMessage({ type: 'progress', message });
const downloadProgress = stage => data => {
  if (data.status === 'progress' && data.total) progress(`${stage}: ${Math.round(data.loaded / data.total * 100)}%`);
  else if (data.status === 'initiate') progress(`Loading ${stage.toLowerCase()}…`);
};
function disposeTensors(values) { for (const value of Object.values(values || {})) value?.dispose?.(); }
async function loadSegmenter() {
  try {
    const adapter = await navigator.gpu?.requestAdapter();
    if (adapter && !(adapter.info?.isFallbackAdapter || adapter.isFallbackAdapter)) {
      const dtype = adapter.features.has('shader-f16') ? 'fp16' : 'fp32';
      sam = await SamModel.from_pretrained(SAM, { dtype, device: 'webgpu', progress_callback: downloadProgress('GPU object outlines') });
      device = 'webgpu'; return;
    }
  } catch { progress('GPU outlines unavailable; loading CPU fallback…'); }
  sam = await SamModel.from_pretrained(SAM, { dtype: 'q8', device: 'wasm', progress_callback: downloadProgress('Object outlines') });
  device = 'wasm';
}

async function load() {
  if (!loading) loading = (async () => {
    progress('Loading local object perception…');
    const segmentation = Promise.all([
      loadSegmenter(),
      AutoProcessor.from_pretrained(SAM),
    ]).then(([, preprocessor]) => { processor = preprocessor; });
    const classification = pipeline('zero-shot-image-classification', CLIP, {
      dtype: 'q8', device: 'wasm', progress_callback: downloadProgress('Object recognition'),
    }).then(value => { classifier = value; }).catch(error => {
      classificationError = error.message || String(error);
      progress('Object recognition unavailable; selection will use generic actions.');
    });
    await Promise.all([segmentation, classification]);
    progress(classifier ? 'Object selection ready.' : 'Object outlines ready; generic actions available.');
    return { segmentation: SAM, classification: classifier ? CLIP : null, classificationError, device };
  })().catch(error => { loading = null; throw new Error('Could not load the object outline model: ' + (error.message || error)); });
  return loading;
}

async function encode(imageDataUrl) {
  if (imageCache?.url === imageDataUrl) return imageCache;
  disposeTensors(imageCache?.embeddings);
  imageCache = null;
  const image = await RawImage.read(imageDataUrl);
  if (!image.width || !image.height) throw new Error('The captured frame is empty.');
  const processed = await processor(image);
  const embeddings = await sam.get_image_embeddings(processed);
  processed.pixel_values?.dispose?.();
  imageCache = { url: imageDataUrl, image, processed, embeddings };
  return imageCache;
}

async function select(imageDataUrl, point) {
  const started = performance.now(); await load();
  progress('Finding the object under your cursor…');
  const { image, processed, embeddings } = await encode(imageDataUrl);
  const [reshapedHeight, reshapedWidth] = processed.reshaped_input_sizes[0];
  const input_points = new Tensor('float32', [point.x * reshapedWidth, point.y * reshapedHeight], [1, 1, 1, 2]);
  const input_labels = new Tensor('int64', [1n], [1, 1, 1]);
  const output = await sam({ ...embeddings, input_points, input_labels });
  const masks = await processor.post_process_masks(output.pred_masks, processed.original_sizes, processed.reshaped_input_sizes);
  const tensor = masks[0], height = tensor.dims.at(-2), width = tensor.dims.at(-1), pixels = width * height;
  const scores = Array.from(output.iou_scores.data);
  const pointIndex = Math.min(height - 1, Math.floor(point.y * height)) * width + Math.min(width - 1, Math.floor(point.x * width));
  const candidates = scores.map((score, index) => ({ score, index })).filter(({ index }) => tensor.data[index * pixels + pointIndex]).sort((a, b) => b.score - a.score);
  const maskCandidates = candidates.map(candidate => { let area = 0; for (let i = candidate.index * pixels, end = i + pixels; i < end; i++) if (tensor.data[i]) area++; return { ...candidate, area, fraction: area / pixels }; });
  if (!candidates.length) { disposeTensors(output); disposeTensors(masks); throw new Error('The model could not isolate the clicked object. Try a point nearer its center.'); }
  // SAM supplies nested object/part alternatives. Prefer the larger genuine mask
  // only when its predicted quality is close to the best candidate.
  const best = maskCandidates.filter(candidate => candidate.score >= Math.max(.7, candidates[0].score - .10)).sort((a, b) => b.area - a.area)[0] || candidates[0];
  if (best.score < .45) { disposeTensors(output); disposeTensors(masks); input_points.dispose?.(); input_labels.dispose?.(); throw new Error('The object boundary is uncertain. Try a clearer point on the object.'); }
  const mask = new Uint8Array(tensor.data.slice(best.index * pixels, (best.index + 1) * pixels));
  const recognitionAlternatives = maskCandidates.filter(candidate => candidate.index !== best.index && candidate.score >= Math.max(.7, candidates[0].score - .10)).map(candidate => new Uint8Array(tensor.data.slice(candidate.index * pixels, (candidate.index + 1) * pixels)));
  let minX = width, minY = height, maxX = -1, maxY = -1, area = 0;
  for (let i = 0; i < pixels; i++) if (mask[i]) { const x = i % width, y = Math.floor(i / width); minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); area++; }
  disposeTensors(output); disposeTensors(masks); input_points.dispose?.(); input_labels.dispose?.();
  if (area < 12 || maxX <= minX || maxY <= minY) throw new Error('The model found no usable object boundary. Try selecting again.');
  const bbox = { x: minX / width, y: minY / height, w: (maxX - minX + 1) / width, h: (maxY - minY + 1) / height };
  const classificationStarted = performance.now(); let label = 'object', confidence = 0, ranked = [];
  // A tiny crop does not contain enough visual evidence for a dependable action label.
  // Keep its genuine mask, but let the player choose generic actions.
  if (classifier && Math.min(maxX - minX + 1, maxY - minY + 1) >= 64) {
    progress('Recognizing the selected object…');
    try {
      async function recognize(selectedMask) {
      let x1 = width, y1 = height, x2 = 0, y2 = 0;
      for (let i = 0; i < selectedMask.length; i++) if (selectedMask[i]) { const x = i % width, y = Math.floor(i / width); x1 = Math.min(x1, x); y1 = Math.min(y1, y); x2 = Math.max(x2, x); y2 = Math.max(y2, y); }
      const pad = Math.max(8, Math.round(Math.max(x2 - x1, y2 - y1) * .08));
      const left = Math.max(0, x1 - pad), top = Math.max(0, y1 - pad);
      const crop = await image.crop([left, top, Math.min(width - 1, x2 + pad), Math.min(height - 1, y2 + pad)]);
      // Isolate the actual SAM-selected pixels. Neighboring machines and images
      // on screens otherwise dominate recognition of the physical display.
      const foreground = crop.toCanvas(), foregroundContext = foreground.getContext('2d');
      const rgba = foregroundContext.getImageData(0, 0, crop.width, crop.height);
      for (let y = 0; y < crop.height; y++) for (let x = 0; x < crop.width; x++) if (!selectedMask[(y + top) * width + x + left]) {
        const offset = (y * crop.width + x) * 4; rgba.data[offset] = rgba.data[offset + 1] = rgba.data[offset + 2] = 128;
      }
      foregroundContext.putImageData(rgba, 0, 0);
      // Preserve the whole physical object: CLIP's default center crop otherwise removes bezels and stands.
      const size = Math.max(crop.width, crop.height), square = new OffscreenCanvas(size, size), context = square.getContext('2d');
      context.fillStyle = '#808080'; context.fillRect(0, 0, size, size); context.drawImage(foreground, (size - crop.width) / 2, (size - crop.height) / 2);
      const result = await classifier(RawImage.fromCanvas(square), labelPrompts.map(([, prompt]) => prompt));
      // Alternate descriptions cover physical and holographic displays without
      // diluting the established monitor description. Use one maximum per class.
      const byClass = new Map();
      for (const item of result) { const label = labelPrompts.find(([, prompt]) => prompt === item.label)[0]; byClass.set(label, Math.max(byClass.get(label) || 0, item.score)); }
      const total = [...byClass.values()].reduce((sum, score) => sum + score, 0);
      return [...byClass].map(([label, score]) => ({ label, score: score / total })).sort((a, b) => b.score - a.score);
      }
      ranked = await recognize(mask);
      // An object plus its attached support can change the square crop enough to
      // confuse CLIP. Resolve ambiguous cases with SAM's other high-quality
      // nested region; the returned highlight remains the complete chosen mask.
      if (ranked[0].score - ranked[1].score < .25) for (const alternative of recognitionAlternatives) {
        const candidate = await recognize(alternative);
        if (candidate[0].score >= .65 && candidate[0].score - candidate[1].score >= .25 && candidate[0].score > ranked[0].score) ranked = candidate;
      }
      if (ranked[0].score >= .55 && ranked[0].score - ranked[1].score >= .15) { label = ranked[0].label; confidence = ranked[0].score; }
    } catch (error) { classificationError = error.message || String(error); }
  }
  return { mask, width, height, bbox, label, confidence, elapsedMs: performance.now() - started, maskScore: best.score, maskArea: area / pixels, classificationMs: performance.now() - classificationStarted, classificationError, ranked, device, maskCandidates };
}

self.onmessage = ({ data }) => {
  queue = queue.catch(() => {}).then(async () => {
    try {
      const result = data.type === 'warmup' ? await load() : await select(data.imageDataUrl, data.point);
      self.postMessage({ id: data.id, result }, result.mask ? [result.mask.buffer] : []);
    } catch (error) { self.postMessage({ id: data.id, error: error.message || String(error) }); }
  });
};
