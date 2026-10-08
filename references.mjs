import crypto from 'node:crypto';
const userAgent = 'ElsewhereHackathonPrototype/0.1 (local educational world-model demo)';
const references = new Map();
const clean = text => String(text || '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
async function wiki(host, params) {
  const url = new URL(`https://${host}/w/api.php`); url.search = new URLSearchParams({ action: 'query', format: 'json', ...params });
  const response = await fetch(url, { headers: { 'User-Agent': userAgent }, signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error('Reference search is unavailable.');
  const data = await response.json(); if (data.error) throw new Error('Reference search did not understand this place.'); return data;
}
function allowedImage(value) { try { const url = new URL(value); return url.protocol === 'https:' && ['upload.wikimedia.org', 'thumb.wikimedia.org'].includes(url.hostname); } catch { return false; } }
export async function findReferences({ name, year, lat, lon }) {
  const historical = Number(year) < 1950;
  const place = String(name || '').replace(/[|<>[\]{}]/g, ' ').slice(0, 100).trim();
  if (!place) throw new Error('Enter a place to find photos.');
  const query = historical ? `${place} ${year} filetype:bitmap` : `${place} street filetype:bitmap`;
  const imageQuery = { generator: 'search', gsrsearch: query, gsrnamespace: '6', gsrlimit: '12', prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: '1280' };
  const coords = Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
  if (place.startsWith('Earth at ') && coords) {
    delete imageQuery.gsrsearch; delete imageQuery.gsrnamespace; delete imageQuery.gsrlimit;
    Object.assign(imageQuery, { generator: 'geosearch', ggscoord: `${lat}|${lon}`, ggsradius: '10000', ggsnamespace: '6', ggslimit: '12' });
  }
  const [images, info] = await Promise.allSettled([
    wiki('commons.wikimedia.org', imageQuery),
    wiki('en.wikipedia.org', { generator: 'search', gsrsearch: place.split(',')[0], gsrlimit: '3', prop: 'extracts|coordinates', exintro: '1', explaintext: '1', exsentences: '2' }),
  ]);
  if (images.status !== 'fulfilled') throw images.reason;
  const results = Object.values(images.value.query?.pages || {}).sort((a, b) => (a.index || 0) - (b.index || 0)).flatMap(page => {
    const image = page.imageinfo?.[0], meta = image?.extmetadata || {}, license = clean(meta.LicenseShortName?.value);
    if (!image || !allowedImage(image.thumburl || image.url) || !['image/jpeg', 'image/png', 'image/webp'].includes(image.mime) || image.width < image.height || image.width < 800 || !/CC BY|CC0|Public domain/i.test(license)) return [];
    const id = crypto.randomUUID();
    const record = {
      id, title: clean(page.title.replace(/^File:/, '')), url: image.thumburl || image.url, source: `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title)}`,
      credit: clean(meta.Artist?.value).slice(0, 240), license, licenseUrl: meta.LicenseUrl?.value || '',
      description: clean(meta.ImageDescription?.value).slice(0, 500), date: clean(meta.DateTimeOriginal?.value || meta.DateTime?.value).slice(0, 100),
    };
    references.set(id, record); while (references.size > 60) references.delete(references.keys().next().value);
    return [{ ...record, image: `/api/reference-image?id=${id}` }];
  }).slice(0, 4);
  const pages = info.status === 'fulfilled' ? Object.values(info.value.query?.pages || {}).sort((a, b) => (a.index || 0) - (b.index || 0)) : [];
  const page = pages.find(p => p.coordinates?.length && p.extract);
  const context = page ? { title: page.title, text: clean(page.extract).slice(0, 420), point: { lat: page.coordinates[0].lat, lon: page.coordinates[0].lon }, source: `https://en.wikipedia.org/?curid=${page.pageid}` } : null;
  return { photos: results, context, search: query, historical, note: historical ? 'Search results are not verified to match the requested year. Check each source date.' : 'Reference photos may show a nearby landmark rather than the exact map point.' };
}
export async function referenceImage(id) {
  const item = references.get(id); if (!item) return null;
  const response = await fetch(item.url, { headers: { 'User-Agent': userAgent }, redirect: 'error', signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('The reference image could not be downloaded. Choose another.');
  const mime = response.headers.get('content-type')?.split(';')[0];
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime)) throw new Error('The reference is not a supported photo.');
  const chunks = []; let size = 0;
  for await (const data of response.body) { size += data.length; if (size > 12000000) throw new Error('The reference image is too large.'); chunks.push(data); }
  return { buffer: Buffer.concat(chunks), mime };
}
