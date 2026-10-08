/** Records only the app's canvas, never the user's screen or microphone. */
export function createClipRecorder(source, { caption, onStatus, onSaved, onError }) {
  let recorder, timer, animation, stream;
  const stop = () => { if (recorder?.state === 'recording') recorder.stop(); };
  const active = () => recorder?.state === 'recording';
  function start() {
    if (active()) { stop(); return; }
    if (!window.MediaRecorder || !source.captureStream) { onError('This browser cannot record the world canvas.'); return; }
    const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(t => MediaRecorder.isTypeSupported(t));
    if (!mimeType) { onError('WebM recording is unavailable in this browser.'); return; }
    const output = document.createElement('canvas'); output.width = 1280; output.height = Math.round(source.height / source.width * 1280) + 78;
    const context = output.getContext('2d'), chunks = [];
    const draw = () => {
      context.drawImage(source, 0, 0, output.width, output.height - 78);
      context.fillStyle = '#14241c'; context.fillRect(0, output.height - 78, output.width, 78);
      const lines = caption();
      lines.slice(0, 3).forEach((line, index) => { context.fillStyle = index ? '#d2decd' : '#d6fb8b'; context.font = index ? '10px sans-serif' : '14px sans-serif'; context.fillText(line, 18, output.height - 52 + index * 21, output.width - 36); });
      animation = requestAnimationFrame(draw);
    };
    draw(); stream = output.captureStream(30);
    recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 3500000 });
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    recorder.onerror = () => onError('Video recording failed.');
    recorder.onstop = async () => {
      clearTimeout(timer); cancelAnimationFrame(animation); stream.getTracks().forEach(track => track.stop()); onStatus('saving');
      try {
        const response = await fetch('/api/clip', { method: 'POST', headers: { 'Content-Type': 'video/webm' }, body: new Blob(chunks, { type: mimeType }) });
        const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Could not save the clip.'); onSaved(data.path);
      } catch (error) { onError(error.message); }
      finally { onStatus('idle'); }
    };
    recorder.start(1000); timer = setTimeout(stop, 20000); onStatus('recording');
  }
  return { start, stop, active };
}
