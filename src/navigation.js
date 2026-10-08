import './navigation.css';

const personIcon = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="7.5" r="3.25"/><path d="M5.5 21v-3.5a6.5 6.5 0 0 1 13 0V21"/></svg>';
const timeIcon = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 7v5l3.5 2"/></svg>';
const copy = value => {
  try { return structuredClone(value); } catch { return { ...value }; }
};
const yearText = year => Number(year) < 0 ? `${Math.abs(Number(year)).toLocaleString()} BCE` : Number(year).toLocaleString('en-US', { useGrouping: false });

/** Small UI over caller-owned world state. Callbacks can honor the optional AbortSignal. */
export function createWorldNavigation({ getWorld, getFrame, onTime, onSwitch, onError, onOpen } = {}) {
  const app = document.querySelector('#app');
  const playUI = document.querySelector('#playUI');
  if (!app || !playUI || typeof getWorld !== 'function') throw new Error('World navigation needs #app, #playUI and getWorld.');
  const today = new Date().getFullYear();
  let characters = [], activeId = null, epoch = 0, controller = null, pending = null, disposed = false;

  const hud = document.createElement('div');
  hud.className = 'world-navigation';
  hud.innerHTML = `<button type="button" class="world-nav-button" data-nav="characters" aria-label="Switch character">${personIcon}<span>Characters</span></button><button type="button" class="world-nav-button" data-nav="time" aria-label="Change time in this place">${timeIcon}<span data-nav-year></span></button>`;
  playUI.append(hud);
  const timeDialog = document.createElement('dialog');
  timeDialog.id = 'worldTimeDialog';
  timeDialog.className = 'panel world-time-panel';
  timeDialog.setAttribute('aria-labelledby', 'worldTimeTitle');
  timeDialog.innerHTML = `<div class="panel-heading"><div><p class="eyebrow">SAME PLACE · ANOTHER TIME</p><h2 id="worldTimeTitle">Move through time</h2></div><button type="button" class="close" data-nav-close aria-label="Close time">×</button></div><p class="world-nav-place" data-time-place></p><form><label class="world-time-year-label" for="worldTimeYear">Year</label><input id="worldTimeYear" class="world-time-year" type="number" min="-10000" max="100000" step="1" required aria-label="Year"><p class="world-time-era" data-time-era></p><input class="world-time-range" type="range" min="1800" max="2200" step="1" aria-label="Timeline from 1800 to 2200"><div class="world-time-limits"><span>1800</span><span>2200</span></div><div class="world-time-presets"><button type="button" data-time-preset="${today}">Today</button><button type="button" data-time-preset="2126">2126</button></div><p class="world-nav-feedback" role="status" aria-live="polite" data-time-feedback hidden></p><button type="submit" class="primary world-time-submit">Move through time <span aria-hidden="true">→</span></button></form>`;
  const characterDialog = document.createElement('dialog');
  characterDialog.id = 'worldCharactersDialog';
  characterDialog.className = 'panel world-character-panel';
  characterDialog.setAttribute('aria-labelledby', 'worldCharactersTitle');
  characterDialog.innerHTML = '<div class="panel-heading"><div><p class="eyebrow">ANOTHER LIFE · ANOTHER PLACE</p><h2 id="worldCharactersTitle">Switch character</h2></div><button type="button" class="close" data-nav-close aria-label="Close characters">×</button></div><div class="world-character-cards"></div><p class="world-nav-feedback" role="status" aria-live="polite" data-character-feedback hidden></p>';
  app.append(timeDialog, characterDialog);
  const yearInput = timeDialog.querySelector('#worldTimeYear');
  const yearRange = timeDialog.querySelector('.world-time-range');
  const timeSubmit = timeDialog.querySelector('[type="submit"]');
  const timeFeedback = timeDialog.querySelector('[data-time-feedback]');
  const characterFeedback = characterDialog.querySelector('[data-character-feedback]');

  function inferActive() {
    const world = getWorld() || {};
    const explicit = characters.find(entry => entry.id === world.characterId);
    if (explicit) activeId = explicit.id;
    else if (!characters.some(entry => entry.id === activeId)) {
      const matches = characters.filter(entry => entry.place === world.place && (!entry.world?.scene || entry.world.scene === world.scene));
      activeId = matches.length === 1 ? matches[0].id : null;
    }
  }
  function feedback(element, message = '', isError = false) {
    element.textContent = message;
    element.hidden = !message;
    element.classList.toggle('error', isError);
  }
  function setBusy(kind = null) {
    pending = kind;
    timeDialog.setAttribute('aria-busy', String(kind === 'time'));
    characterDialog.setAttribute('aria-busy', String(kind === 'characters'));
    for (const control of timeDialog.querySelectorAll('input,[data-time-preset],[type="submit"]')) control.disabled = kind === 'time';
    timeSubmit.textContent = kind === 'time' ? 'Moving through time…' : 'Move through time →';
    for (const card of characterDialog.querySelectorAll('[data-character-id]')) card.disabled = !!kind || card.dataset.characterId === activeId;
  }
  function cancelPending() {
    epoch += 1;
    controller?.abort();
    controller = null;
    setBusy();
  }
  function close(dialog) {
    cancelPending();
    if (dialog.open) dialog.close();
  }
  for (const dialog of [timeDialog, characterDialog]) {
    dialog.querySelector('[data-nav-close]').addEventListener('click', () => close(dialog));
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(dialog); });
    dialog.addEventListener('close', () => {
      const kind = dialog === timeDialog ? 'time' : 'characters';
      if (!dialog.open && pending === kind) cancelPending();
      if (!document.querySelector('dialog[open]')) document.querySelector('#world')?.focus({ preventScroll: true });
    });
  }
  function open(dialog) {
    if (disposed) return;
    for (const other of [timeDialog, characterDialog]) if (other !== dialog && other.open) close(other);
    cancelPending();
    onOpen?.();
    if (!dialog.open) dialog.showModal();
  }
  function syncDraft() {
    const year = Number(yearInput.value);
    if (yearInput.value !== '' && Number.isFinite(year)) {
      yearRange.value = String(Math.max(1800, Math.min(2200, year)));
      timeDialog.querySelector('[data-time-era]').textContent = year > today ? 'Imagined future' : year < today ? 'Historical reconstruction' : 'Present day';
    }
    for (const button of timeDialog.querySelectorAll('[data-time-preset]')) button.setAttribute('aria-pressed', String(Number(button.dataset.timePreset) === year));
  }
  yearInput.addEventListener('input', syncDraft);
  yearRange.addEventListener('input', () => { yearInput.value = yearRange.value; syncDraft(); });
  for (const button of timeDialog.querySelectorAll('[data-time-preset]')) button.addEventListener('click', () => { yearInput.value = button.dataset.timePreset; syncDraft(); });

  function updateCurrentCharacter({ capture = true } = {}) {
    inferActive();
    const entry = characters.find(item => item.id === activeId);
    if (!entry) return null;
    const world = getWorld() || {};
    entry.world = copy(world);
    if (world.place) entry.place = world.place;
    if (Number.isFinite(Number(world.year))) entry.year = Number(world.year);
    if (capture && getFrame) {
      try {
        const frame = getFrame();
        if (typeof frame === 'string' && frame) { entry.image = frame; delete entry.blob; }
        else if (frame instanceof Blob) entry.blob = frame;
      } catch { /* A transient missing video frame should not block navigation. */ }
    }
    return copy(entry);
  }
  function renderCharacters() {
    const cards = characterDialog.querySelector('.world-character-cards');
    cards.replaceChildren();
    if (!characters.length) {
      const empty = document.createElement('p');
      empty.className = 'world-nav-empty';
      empty.textContent = 'No characters available yet.';
      cards.append(empty);
      return;
    }
    for (const entry of characters) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'world-character-card';
      card.dataset.characterId = entry.id;
      card.classList.toggle('is-current', entry.id === activeId);
      card.disabled = !!pending || entry.id === activeId;
      const visual = document.createElement('div');
      visual.className = 'world-character-visual';
      visual.innerHTML = `<span class="world-character-silhouette">${personIcon}</span>`;
      if (entry.image) {
        const image = document.createElement('img');
        image.alt = '';
        image.src = entry.image;
        image.addEventListener('error', () => image.remove(), { once: true });
        visual.prepend(image);
        image.addEventListener('load', () => visual.classList.add('has-image'), { once: true });
      }
      const badge = document.createElement('span');
      badge.className = 'world-character-badge';
      badge.textContent = entry.id === activeId ? 'YOU ARE HERE' : 'SWITCH ↗';
      visual.append(badge);
      const caption = document.createElement('div');
      caption.className = 'world-character-caption';
      const name = document.createElement('strong');
      name.textContent = entry.name || entry.place || entry.id;
      const place = document.createElement('span');
      place.textContent = entry.place || entry.world?.place || '';
      const year = document.createElement('small');
      year.textContent = yearText(entry.year ?? entry.world?.year ?? today);
      caption.append(name, place, year);
      card.append(visual, caption);
      card.addEventListener('click', () => switchCharacter(entry));
      cards.append(card);
    }
  }
  async function run(dialog, kind, callback) {
    cancelPending();
    const attempt = epoch;
    controller = new AbortController();
    const signal = controller.signal;
    const targetFeedback = kind === 'time' ? timeFeedback : characterFeedback;
    feedback(targetFeedback);
    setBusy(kind);
    try {
      const result = await callback({ signal });
      if (attempt !== epoch || signal.aborted || !dialog.open) return false;
      if (result === false) {
        feedback(targetFeedback, 'Interrupted. Try again.');
        return false;
      }
      return true;
    } catch (error) {
      if (attempt !== epoch || signal.aborted || !dialog.open) return false;
      feedback(targetFeedback, error?.message || 'Could not make that change. Try again.', true);
      onError?.(error);
      return false;
    } finally {
      if (attempt === epoch) { controller = null; setBusy(); }
    }
  }
  async function switchCharacter(entry) {
    if (pending || entry.id === activeId) return;
    updateCurrentCharacter();
    const applied = await run(characterDialog, 'characters', async context => {
      if (typeof onSwitch !== 'function') throw new Error('Character switching is not connected yet.');
      return onSwitch(copy(entry), context);
    });
    if (!applied) return;
    activeId = entry.id;
    updateCurrentCharacter({ capture: false });
    characterDialog.close();
    update();
  }
  timeDialog.querySelector('form').addEventListener('submit', async event => {
    event.preventDefault();
    if (pending || !yearInput.reportValidity()) return;
    const year = Number(yearInput.value);
    const applied = await run(timeDialog, 'time', async context => {
      if (typeof onTime !== 'function') throw new Error('Time travel is not connected yet.');
      return onTime(year, context);
    });
    if (!applied) return;
    updateCurrentCharacter({ capture: false });
    timeDialog.close();
    update();
  });
  function openTime() {
    const world = getWorld() || {};
    timeDialog.querySelector('[data-time-place]').textContent = world.place || '';
    yearInput.value = String(Number.isFinite(Number(world.year)) ? Number(world.year) : today);
    feedback(timeFeedback);
    syncDraft();
    open(timeDialog);
  }
  function openCharacters() {
    updateCurrentCharacter();
    feedback(characterFeedback);
    renderCharacters();
    open(characterDialog);
  }
  function setCharacters(entries) {
    const ids = new Set();
    characters = (Array.isArray(entries) ? entries : []).filter(entry => {
      if (!entry || typeof entry.id !== 'string' || !entry.id || ids.has(entry.id)) return false;
      ids.add(entry.id);
      return true;
    }).map(copy);
    inferActive();
    renderCharacters();
    update();
  }
  function update() {
    if (disposed) return;
    inferActive();
    const world = getWorld() || {};
    hud.querySelector('[data-nav-year]').textContent = yearText(world.year ?? today);
    hud.querySelector('[data-nav="time"]').setAttribute('aria-label', `Change time in this place, current year ${yearText(world.year ?? today)}`);
    if (characterDialog.open && !pending) renderCharacters();
  }
  function getState() {
    return {
      activeCharacter: activeId,
      characters: characters.map(({ id, name, place, year }) => ({ id, name, place, year, current: id === activeId })),
      dialog: timeDialog.open ? 'time' : characterDialog.open ? 'characters' : null,
      pending,
      draftYear: timeDialog.open && yearInput.value !== '' ? Number(yearInput.value) : null,
      feedback: timeDialog.open ? timeFeedback.textContent : characterDialog.open ? characterFeedback.textContent : '',
    };
  }
  function dispose() {
    disposed = true;
    cancelPending();
    hud.remove();
    timeDialog.remove();
    characterDialog.remove();
  }
  hud.querySelector('[data-nav="characters"]').addEventListener('click', openCharacters);
  hud.querySelector('[data-nav="time"]').addEventListener('click', openTime);
  update();
  return { openTime, openCharacters, setCharacters, update, getState, updateCurrentCharacter, dispose };
}
