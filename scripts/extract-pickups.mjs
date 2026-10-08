import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.resolve(project, '../submission/gameplay');
const source = path.join(project, 'artifacts/pickups/pickups.webm');
const reportPath = path.join(project, 'artifacts/pickups/report.json');
const walkthroughDir = path.join(project, 'artifacts/presentation-clips');
const pickupsDir = path.join(output, 'pickups');
const run = (command, args) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', data => { stdout += data; });
  child.stderr.on('data', data => { stderr += data; });
  child.on('error', reject);
  child.on('close', code => code === 0 ? resolve(stdout) : reject(new Error(`${command} exited ${code}: ${stderr}`)));
});
const probe = async file => JSON.parse(await run('ffprobe', [
  '-v', 'error', '-show_entries', 'format=duration,size:stream=codec_type,codec_name,width,height,pix_fmt,r_frame_rate', '-of', 'json', file,
]));
const digest = async file => crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
const writeJSON = (file, value) => fs.writeFile(file, JSON.stringify(value, null, 2) + '\n');
const report = JSON.parse(await fs.readFile(reportPath, 'utf8'));
if (report.errors?.length) throw new Error(`Recording reports errors: ${JSON.stringify(report.errors)}`);
const rawProbe = await probe(source);
const sourceDuration = Number(rawProbe.format.duration);
const timingOffset = sourceDuration - (report.recordingEnd - report.recordingStart) / 1000;
if (!Number.isFinite(timingOffset) || Math.abs(timingOffset) > 5) throw new Error(`Unexpected recording offset: ${timingOffset}`);
await fs.mkdir(pickupsDir, { recursive: true });
const clips = Array(report.segments.length);
let cursor = 0;
await Promise.all(Array.from({ length: 2 }, async () => {
  while (cursor < report.segments.length) {
    const index = cursor++;
    const segment = report.segments[index];
    if (!/^[a-z0-9-]+$/.test(segment.name)) throw new Error('Unsafe segment filename');
    const start = segment.start + timingOffset;
    const end = segment.end + timingOffset;
    const expectedDuration = segment.end - segment.start;
    if (start < 0 || end > sourceDuration + .04 || expectedDuration <= 0) throw new Error(`Invalid segment ${segment.name}`);
    const filename = `${segment.name}.mp4`;
    const dest = path.join(pickupsDir, filename);
    await run('ffmpeg', ['-v', 'error', '-y', '-ss', start.toFixed(3), '-i', source,
      '-t', expectedDuration.toFixed(3), '-map', '0:v:0', '-an',
      '-vf', 'scale=1600:900:force_original_aspect_ratio=decrease,pad=1600:900:(ow-iw)/2:(oh-ih)/2,setsar=1',
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-threads', '2', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', dest]);
    const metadata = await probe(dest);
    const video = metadata.streams.find(stream => stream.codec_type === 'video');
    const duration = Number(metadata.format.duration);
    if (video?.codec_name !== 'h264' || video.width !== 1600 || video.height !== 900 || video.pix_fmt !== 'yuv420p' || metadata.streams.some(stream => stream.codec_type === 'audio') || Math.abs(duration - expectedDuration) > .12) {
      throw new Error(`Output verification failed for ${filename}: ${JSON.stringify(metadata)}`);
    }
    clips[index] = { filename, path: `pickups/${filename}`, kind: segment.kind,
      tag: segment.kind === 'Live Reactor gameplay' ? 'Actual gameplay' : 'Working local controls',
      duration, expectedDuration, sourceStart: start, sourceEnd: end, recordedStart: segment.start, recordedEnd: segment.end,
      world: segment.world, bytes: Number(metadata.format.size), sha256: await digest(dest), video, audio: false };
    console.log(`${filename}: ${duration.toFixed(3)}s, ${video.width}×${video.height}, H264, no audio`);
  }
}));

const walkthroughManifest = JSON.parse(await fs.readFile(path.join(walkthroughDir, 'manifest.json'), 'utf8'));
const walkthrough = [];
for (const clip of walkthroughManifest.clips) {
  const original = path.join(walkthroughDir, clip.filename);
  const destination = path.join(output, clip.filename);
  const [sourceHash, destinationHash] = await Promise.all([digest(original), digest(destination)]);
  if (sourceHash !== destinationHash) throw new Error(`Existing walkthrough clip differs; preserved without overwrite: ${clip.filename}`);
  const metadata = await probe(destination);
  const video = metadata.streams.find(stream => stream.codec_type === 'video');
  if (video?.codec_name !== 'h264') throw new Error(`Walkthrough is not H264: ${clip.filename}`);
  const local = /local/i.test(clip.kind) || clip.filename === '13-hologram-selected.mp4';
  walkthrough.push({ ...clip, path: clip.filename, tag: local ? 'Working local controls' : 'Actual gameplay',
    duration: Number(metadata.format.duration), bytes: Number(metadata.format.size), video,
    sha256: destinationHash, audio: metadata.streams.some(stream => stream.codec_type === 'audio'), identicalToOriginal: true });
}

const rawDir = path.join(output, 'raw');
await fs.mkdir(rawDir, { recursive: true });
for (const [name, target] of [
  ['pickups.webm', source], ['pickups-report.json', reportPath],
  ['walkthrough.webm', path.join(project, 'artifacts/live-story/presentation-check.webm')],
]) {
  const link = path.join(rawDir, name);
  const relative = path.relative(rawDir, target);
  try { await fs.symlink(relative, link); }
  catch (error) { if (error.code !== 'EEXIST' || await fs.readlink(link) !== relative) throw error; }
}
const notes = [
  'Actual screen recordings of the prototype. No audio. Clips are trimmed and H264 encoded; pickup segments retain their full recorded start/end ranges.',
  'Scene changes use explicit reference-image reseeds. These clips do not demonstrate one physically continuous simulated world.',
  'Working local controls are the object selection, computer, neural-network training and deterministic robot interface over the generated scene.',
  'The New York source photographs were taken in 2023. The app year 2026 is the selected setting, not the photograph capture date. Future and lunar scenes are fictional generated references.',
  'The 16 existing walkthrough exports and their original manifest are preserved at the package root. Raw symlinks require the adjacent dream-world project directory.',
];
const pickupManifest = { recordedAt: new Date(report.recordingStart).toISOString(), source: '../raw/pickups.webm',
  sourceReport: '../raw/pickups-report.json', sourceDuration, timingOffset, clips, errors: report.errors, notes };
await writeJSON(path.join(pickupsDir, 'manifest.json'), pickupManifest);
const manifest = { generatedAt: new Date().toISOString(), notes, pickups: pickupManifest,
  walkthrough: { originalManifest: 'manifest.json', source: 'raw/walkthrough.webm', clips: walkthrough },
  attribution: walkthroughManifest.attribution, verification: { ffprobe: true, rootWalkthroughHashesMatchOriginals: true, failures: [] } };
await writeJSON(path.join(output, 'gameplay-package.json'), manifest);

const escape = value => String(value).replace(/[&<>\"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]);
const title = filename => filename.replace(/^\d+-|\.mp4$/g, '').replaceAll('-', ' ').replace(/^./, letter => letter.toUpperCase());
const cards = entries => entries.map(clip => `<article><video controls preload="none" playsinline src="${escape(clip.path)}"></video><div class="detail"><span class="tag ${clip.tag === 'Actual gameplay' ? 'live' : 'local'}">${escape(clip.tag)}</span><span class="duration">${clip.duration.toFixed(2)} s</span><h3>${escape(title(clip.filename))}</h3><p>${escape(clip.kind)}</p><a href="${escape(clip.path)}" download>Download MP4</a></div></article>`).join('\n');
const credits = walkthroughManifest.attribution.map(item => `<li><strong>${escape(item.scenes)}:</strong> ${item.author ? `${escape(item.author)} · ${escape(item.date)} · <a href="https://creativecommons.org/licenses/by-sa/2.0/">${escape(item.license)}</a>. <a href="${escape(item.source)}">Original source</a>. ${escape(item.modifications)}` : escape(item.source)}</li>`).join('\n');
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Dream World · Recorded gameplay</title>
<style>*,*::before,*::after{box-sizing:border-box}body{margin:0;background:#11171a;color:#eef2f1;font:16px/1.55 system-ui,sans-serif}main{max-width:1320px;margin:auto;padding:44px 24px 70px}header{max-width:900px}h1{font-size:clamp(32px,5vw,54px);line-height:1.08;margin:12px 0 20px;letter-spacing:-.04em}h2{font-size:24px;margin:40px 0 16px}h3{font-size:19px;margin:12px 0 4px}p{color:#bbc7cb;margin:8px 0}a{color:#8fdfd4;text-underline-offset:3px}.eyebrow{color:#8fdfd4;letter-spacing:.13em;text-transform:uppercase;font-size:12px}.note{border-left:3px solid #5c847d;padding-left:15px;margin:24px 0}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,360px),1fr));gap:20px}article{background:#1b2429;border:1px solid #354248;border-radius:12px;overflow:hidden}video{display:block;width:100%;aspect-ratio:16/9;background:#080d10;object-fit:contain}.detail{padding:16px}.detail p{font-size:13px;min-height:40px}.detail a{font-size:13px}.tag{display:inline-block;padding:4px 8px;border-radius:5px;font-size:11px;font-weight:650}.live{background:#25443e;color:#b1f2db}.local{background:#403b2a;color:#f0d98f}.duration{float:right;font-size:12px;color:#b6c4c9;margin:4px 0}footer{margin-top:44px;padding-top:20px;border-top:1px solid #354248;font-size:13px;color:#aebfc5}footer li{margin-bottom:10px}nav{display:flex;gap:18px;flex-wrap:wrap;margin-top:20px;font-size:14px}</style></head>
<body><main><header><div class="eyebrow">Dream World · Prototype recording</div><h1>From New York to a lunar robot factory.</h1><p>Recorded play and working computer controls. Select a clip to watch the actual capture.</p><div class="note"><p><strong>No audio.</strong> Scene changes use explicit reference-image reseeds. The computer, AI training and robot controls run locally; the surrounding scenes use Reactor video.</p><p>Future and lunar settings are imagined. New York source photos were captured in 2023.</p></div><nav><a href="gameplay-package.json">Verified package manifest</a><a href="pickups/manifest.json">Full-segment timestamps</a><a href="manifest.json">Original walkthrough manifest</a><a href="README.md">Handoff notes</a><a href="raw/pickups.webm">Raw pickup recording</a><a href="raw/walkthrough.webm">Raw walkthrough</a></nav></header>
<h2>Full interaction takes</h2><div class="grid">${cards(clips)}</div>
<h2>Walkthrough excerpts</h2><p>Original recorded excerpts, preserved unchanged.</p><div class="grid">${cards(walkthrough)}</div>
<footer><p>Exports contain the recorded screen, with trimming and encoding only. No generated replacement footage was added during packaging. Video-model geometry and character motion can drift.</p><ul>${credits}</ul><p>Photo-derived footage includes AI modifications. Raw-recording links point to the adjacent project and must travel with it.</p></footer></main></body></html>\n`;
await fs.writeFile(path.join(output, 'index.html'), html, { flag: 'wx' });
console.log(JSON.stringify({ output, timingOffset, pickups: clips.length, walkthrough: walkthrough.length, failures: [] }));
