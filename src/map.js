import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
let map, marker, selected = { lat: 40.7, lon: -74.01 }, reference = null, referenceName = '', searchEpoch = 0;
const $ = id => document.getElementById(id);
function select(lat, lon, name) {
  selected = { lat, lon }; if (name) $('travelPlace').value = name;
  $('coordinates').textContent = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  marker.setLatLng([lat, lon]);
}
export function openMap(point) {
  ++searchEpoch; $('findPhotos').disabled = false;
  if (!map) {
    map = L.map('earthMap', { worldCopyJump: true }).setView([40.7, -74.01], 4);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 17, attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>' }).addTo(map);
    marker = L.marker([40.7, -74.01], { icon: L.divIcon({ className: 'map-pin', iconSize: [14, 14], iconAnchor: [7, 7] }) }).addTo(map);
    map.on('click', event => { const lon = ((event.latlng.lng + 180) % 360 + 360) % 360 - 180; select(event.latlng.lat, lon, `Earth at ${event.latlng.lat.toFixed(3)}, ${lon.toFixed(3)}`); });
    $('searchPlace').addEventListener('click', search);
    $('travelPlace').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); void search(); } });
    $('travelPlace').addEventListener('input', () => { selected = null; $('coordinates').textContent = 'Search to locate this place on the map.'; });
  }
  if (point) select(point.lat, point.lon);
  setTimeout(() => { map.invalidateSize(); if (selected) map.setView([selected.lat, selected.lon], map.getZoom()); }, 30);
}
export const getMapPoint = () => selected ? ({ ...selected }) : null;
export async function lookupReferences(name, year, point) {
  const query = new URLSearchParams({ name: name.split(',')[0], year: String(year) });
  if (point) { query.set('lat', String(point.lat)); query.set('lon', String(point.lon)); }
  const response = await fetch('/api/references?' + query);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Reference search is unavailable.');
  return data;
}
export async function search() {
  const name = $('travelPlace').value.trim(); if (name.length < 2) return;
  $('searchPlace').disabled = true; $('placeResults').textContent = 'Searching…';
  try {
    const response = await fetch(`/api/places?name=${encodeURIComponent(name)}`); const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Search unavailable.');
    $('placeResults').replaceChildren();
    if (!data.results.length) $('placeResults').textContent = 'No match. You can still choose a point on the map.';
    for (const result of data.results) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = [result.name, result.admin1, result.country].filter(Boolean).join(', ');
      button.addEventListener('click', () => { select(result.latitude, result.longitude, [result.name, result.country].filter(Boolean).join(', ')); map.setView([result.latitude, result.longitude], 11); $('placeResults').replaceChildren(); if ($('realReference').checked) void findPhotos(); });
      $('placeResults').append(button);
    }
  } catch { $('placeResults').textContent = 'Search is unavailable. Pick a map point or type a place to imagine.'; }
  finally { $('searchPlace').disabled = false; }
}
export function getReference() { return referenceName === `${$('travelPlace').value.trim()}|${$('travelYear').value}` ? reference : null; }
export async function findPhotos() {
  const name = $('travelPlace').value.trim(); if (!name) return null;
  const epoch = ++searchEpoch; reference = null; referenceName = `${name}|${$('travelYear').value}`;
  $('findPhotos').disabled = true; $('referencePhotos').replaceChildren(); $('referenceCredit').replaceChildren(); $('referenceStatus').textContent = 'Finding reference photos…';
  try {
    const data = await lookupReferences(name, $('travelYear').value, selected);
    if (epoch !== searchEpoch) return null;
    if (!data.photos.length) { $('referenceStatus').textContent = 'No suitable photo found. Choose another year/place, or turn off real photos to use the imagined starting scene.'; return null; }
    const selectPhoto = (photo, button) => {
      reference = { ...photo, context: data.context }; $('referencePhotos').querySelectorAll('button').forEach(b => b.classList.toggle('selected', b === button));
      $('referenceCredit').replaceChildren(); const link = document.createElement('a'); link.href = photo.source; link.target = '_blank'; link.rel = 'noreferrer'; link.textContent = `${photo.credit} · ${photo.license} ↗`; $('referenceCredit').append(link);
      $('referenceStatus').textContent = `${photo.title}${photo.date ? ' · ' + photo.date : ''}`;
      $('referenceContext').replaceChildren();
      if (data.context) { const info = document.createElement('a'); info.href = data.context.source; info.target = '_blank'; info.rel = 'noreferrer'; info.textContent = data.context.text + ' — Wikipedia ↗'; $('referenceContext').append(info); }
    };
    for (const photo of data.photos) {
      const button = document.createElement('button'); button.type = 'button'; button.title = photo.title; button.setAttribute('aria-label', 'Use photo: ' + photo.title);
      const image = document.createElement('img'); image.src = photo.image; image.alt = photo.title; button.append(image); button.addEventListener('click', () => selectPhoto(photo, button)); $('referencePhotos').append(button);
      if (!reference) selectPhoto(photo, button);
    }
    return reference;
  } catch (error) { if (epoch === searchEpoch) $('referenceStatus').textContent = `${error.message || 'Reference search unavailable.'} You can use an imagined starting scene.`; return null; }
  finally { if (epoch === searchEpoch) $('findPhotos').disabled = false; }
}
$('findPhotos').addEventListener('click', findPhotos);
$('realReference').addEventListener('change', () => { $('referencePhotos').hidden = !$('realReference').checked; });
