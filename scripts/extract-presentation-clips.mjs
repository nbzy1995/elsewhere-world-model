import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const sourceDir = process.argv[2] || 'artifacts/live-story';
const preview = sourceDir.includes('story-smoke');
const video = `${sourceDir}/${preview ? 'preview-and-computer.webm' : 'presentation-check.webm'}`;
const report = JSON.parse(await readFile(`${sourceDir}/report.json`, 'utf8'));
if (!report.recordingStart || !report.recordingEnd) throw new Error('Recording has not finished.');
const duration = Number(execFileSync('/usr/local/bin/ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', video], { encoding: 'utf8' }).trim());
const offset = duration - (report.recordingEnd - report.recordingStart) / 1000;
if (Math.abs(offset) > 5) throw new Error(`Video timing differs by ${offset.toFixed(2)} seconds; inspect before extracting.`);
const folder = 'artifacts/presentation-clips'; await mkdir(folder, { recursive: true });
const events = report.events || report.stages;
const clips = [];
for (const event of events) {
  if (event.name === 'failure' || (!preview && event.mode !== 'live world' && event.mode !== 'robot workbench')) continue;
  const local = /computer|train-ai|robot-ai/.test(event.name);
  const seconds = /flight-moved|cockpit-flight/.test(event.name) ? 6 : 4.5;
  const end = Math.min(duration, event.elapsed + offset - .15), start = Math.max(0, end - seconds);
  const filename = `${preview ? 'preview-' : ''}${event.name}.mp4`;
  execFileSync('/usr/local/bin/ffmpeg', ['-v', 'error', '-y', '-ss', start.toFixed(3), '-i', video, '-t', (end - start).toFixed(3), '-an', '-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', `${folder}/${filename}`], { stdio: ['ignore', 'ignore', 'pipe'] });
  clips.push({ filename, duration: end - start, sourceStart: start, sourceEnd: end, kind: local ? 'Working local computer / robot interface' : preview ? 'Prepared scene preview; no model movement' : 'Recorded live Reactor video and game UI', place: event.place || event.world?.place, year: event.year || event.world?.year, view: event.view || event.world?.view });
  console.log('SAVED', filename);
}
const manifest = { recordedAt: new Date(report.recordingStart).toISOString(), source: video, sourceDuration: duration, timingOffset: offset, note: 'Unedited screen captures except trimming and encoding. Scene changes use explicit model reseeds. Computer and robot bench run locally. Video-model geometry and character motion can drift.', clips, attribution: [
  { scenes: 'Empire State present and future', author: 'Mobilus In Mobili', source: 'https://commons.wikimedia.org/wiki/File:8%2634_NYC_2023_(52996079026).jpg', date: '2023-02-08', license: 'CC BY-SA 2.0', modifications: 'Generated explorer, future interpretation and Reactor video.' },
  { scenes: 'Times Square', author: 'Sergiy Galyonkin', source: 'https://commons.wikimedia.org/wiki/File:Times_Square_2023.jpg', date: '2023-09-16', license: 'CC BY-SA 2.0', modifications: 'Generated traveler and Reactor video.' },
  { scenes: 'Lunar scenes', source: 'Generated fictional assets; receipts in artifacts/*.json' },
] };
await writeFile(`${folder}/${preview ? 'preview-' : ''}manifest.json`, JSON.stringify(manifest, null, 2));
const escape = s => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
const cards = clips.map(clip => `<article><video controls preload="metadata" src="${escape(clip.filename)}"></video><h2>${escape(clip.filename.replace('.mp4', ''))}</h2><p>${escape(clip.kind)} · ${clip.duration.toFixed(1)}s</p><a download href="${escape(clip.filename)}">Download MP4</a></article>`).join('');
await writeFile(`${folder}/${preview ? 'preview-' : ''}index.html`, `<!doctype html><html><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Elsewhere — presentation clips</title><style>body{margin:40px;background:#0b1519;color:#e7f1f2;font:15px/1.5 system-ui}h1{font-size:32px;font-weight:500}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:28px}article{border:1px solid #42616c55;border-radius:10px;overflow:hidden;padding-bottom:18px}video{width:100%;display:block;background:black}h2,p,article a{margin:12px 18px}h2{font-size:15px;font-weight:500}p{color:#a9c3c8;font-size:13px}a{color:#b0e6ec}footer{margin-top:36px;max-width:850px;color:#9ab2b8}header{margin-bottom:30px}header p{margin:0}</style><header><h1>Elsewhere / presentation clips</h1><p>${preview ? 'Scene previews and working local interactions.' : 'Captured from the running app. Live world video, game controls and local computer/robot interactions.'}</p></header><main>${cards}</main><footer><p>${escape(manifest.note)}</p><p>NYC source photos: <a href="${manifest.attribution[0].source}">Mobilus In Mobili</a> and <a href="${manifest.attribution[1].source}">Sergiy Galyonkin</a>, 2023, CC BY-SA 2.0. AI modifications. Lunar environments are fictional.</p><a href="${preview ? 'preview-' : ''}manifest.json">Recording details and attribution</a></footer></html>`);
console.log(JSON.stringify({ clips: clips.length, folder, duration, offset }));
