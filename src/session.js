import { Reactor } from '@reactor-team/js-sdk';

export const MODEL = 'reactor/lingbot-world-2';
export const axes = {
  longitudinal: ['set_move_longitudinal', 'move_longitudinal'], lateral: ['set_move_lateral', 'move_lateral'],
  horizontal: ['set_look_horizontal', 'look_horizontal'], vertical: ['set_look_vertical', 'look_vertical'],
};

/** UI uses acknowledgements and received frames; sending is not visual success. */
export class WorldSession {
  constructor(callbacks) {
    this.callbacks = callbacks; this.client = null; this.epoch = 0; this.pending = new Set();
    this.state = {}; this.connected = false; this.operations = Promise.resolve(); this.closing = Promise.resolve();
  }
  emit(type, value) { this.callbacks[type]?.(value); }
  current(client, epoch) { return this.client === client && this.epoch === epoch; }
  async connect(prompt, image) {
    if (this.client || this.opening) return;
    this.opening = true; const epoch = ++this.epoch;
    this.controller = new AbortController();
    try {
      await this.closing;
      this.emit('status', 'Connecting');
      const response = await fetch('/api/token', { method: 'POST', signal: this.controller.signal });
      const token = await response.json();
      if (epoch !== this.epoch) return;
      if (!response.ok) throw new Error(token.error || 'Could not start a session.');
      if (token.model !== MODEL || !token.jwt) throw new Error('Invalid session token response.');
      const client = new Reactor({ modelName: MODEL }); this.client = client;
      client.on('statusChanged', status => {
        if (!this.current(client, epoch)) return;
        this.emit('log', `Connection: ${status}`);
        if (status === 'waiting') this.emit('status', 'Waiting for a GPU');
        if (status === 'disconnected') void this.fail('The world connection ended. You can reconnect.');
      });
      client.on('trackReceived', (name, track, stream) => {
        if (this.current(client, epoch) && name === 'main_video') this.emit('stream', stream || new MediaStream([track]));
      });
      client.on('error', error => { if (this.current(client, epoch)) void this.fail(error.message || String(error)); });
      client.on('message', message => {
        if (!this.current(client, epoch)) return;
        const data = message.data || {};
        if (message.type === 'command_error') {
          const error = new Error(`${data.command}: ${data.reason}`);
          for (const waiter of [...this.pending]) if (waiter.command === data.command) waiter.reject(error);
          this.emit('error', error.message); return;
        }
        if (message.type === 'state') { this.state = data; this.emit('state', data); }
        if (message.type === 'chunk_complete') this.emit('chunk', data);
        if (['image_accepted', 'prompt_accepted', 'generation_started', 'generation_paused', 'generation_resumed', 'generation_reset'].includes(message.type)) this.emit('log', message.type);
        for (const waiter of [...this.pending]) waiter.receive(message);
      });
      await client.connect(token.jwt);
      if (!this.current(client, epoch)) return;
      this.connected = true; this.emit('status', 'Preparing the starting image');
      const ref = await client.uploadFile(image, { name: 'starting-world.png' });
      if (!this.current(client, epoch)) return;
      await this.confirm('set_image', { image: ref }, m => m.type === 'image_accepted');
      await this.confirm('set_prompt', { prompt }, m => m.type === 'prompt_accepted' && m.data.prompt === prompt);
      await client.sendCommand('set_rotation_speed_deg', { rotation_speed_deg: 1 });
      this.emit('status', 'Generating your world');
      await this.confirm('start', {}, m => m.type === 'generation_started' || (m.type === 'state' && m.data.running));
      if (!this.current(client, epoch)) return;
      this.timer = setTimeout(() => { void this.stop(); this.emit('ended', 'Five-minute session ended. Enter again to continue.'); }, 290000);
    } catch (error) {
      if (epoch === this.epoch) await this.fail(error.name === 'AbortError' ? 'Connection cancelled.' : error.message);
    } finally { if (epoch === this.epoch) this.opening = false; }
  }
  confirm(command, data, accepts) {
    const client = this.client;
    if (!client) return Promise.reject(new Error('No world is connected.'));
    return new Promise((resolve, reject) => {
      const finish = error => { clearTimeout(timer); this.pending.delete(waiter); error ? reject(error) : resolve(); };
      const waiter = { command, reject: finish, receive: message => { if (accepts(message)) finish(); } };
      const timer = setTimeout(() => finish(new Error(`Timed out waiting for ${command}.`)), 25000);
      this.pending.add(waiter); client.sendCommand(command, data).catch(finish);
    });
  }
  async command(name, data) { if (this.connected) await this.client?.sendCommand(name, data); }
  async prompt(prompt, resetContext = true) {
    const epoch = this.epoch;
    const task = this.operations.catch(() => {}).then(async () => {
      if (epoch !== this.epoch || !this.connected) throw new Error('Enter a world first.');
      await this.confirm('set_prompt', { prompt }, m => m.type === 'prompt_accepted' && m.data.prompt === prompt);
      if (resetContext && epoch === this.epoch) await this.command('trigger_kv_cache_reset', {});
    });
    this.operations = task; return task;
  }
  async motion(values) {
    if (!this.connected) return;
    for (const [axis, value] of Object.entries(values)) {
      const [command, field] = axes[axis]; await this.command(command, { [field]: value });
    }
  }
  async pause() {
    if (!this.state.running) return;
    await this.confirm('pause', {}, m => m.type === 'generation_paused' || (m.type === 'state' && m.data.paused));
  }
  async resume() {
    if (!this.state.paused) return;
    await this.confirm('resume', {}, m => m.type === 'generation_resumed' || (m.type === 'state' && m.data.running));
  }
  async reset(prompt, image) {
    const epoch = this.epoch, client = this.client;
    const task = this.operations.catch(() => {}).then(async () => {
      if (!client || epoch !== this.epoch) throw new Error('Enter a world first.');
      await this.confirm('reset', {}, m => m.type === 'generation_reset');
      const ref = await client.uploadFile(image, { name: 'world-arrival.png' });
      if (epoch !== this.epoch) return;
      await this.confirm('set_image', { image: ref }, m => m.type === 'image_accepted');
      await this.confirm('set_prompt', { prompt }, m => m.type === 'prompt_accepted' && m.data.prompt === prompt);
      await this.confirm('start', {}, m => m.type === 'generation_started');
    });
    this.operations = task; return task;
  }
  async stop() {
    ++this.epoch; this.opening = false; this.connected = false; this.controller?.abort(); clearTimeout(this.timer);
    for (const waiter of [...this.pending]) waiter.reject(new Error('Session ended.'));
    const client = this.client; this.client = null; this.state = {};
    this.closing = this.closing.catch(() => {}).then(async () => { if (client) await client.disconnect(); }).catch(error => this.emit('log', 'Disconnect: ' + error.message));
    await this.closing; this.emit('log', 'Session disconnected.');
  }
  async fail(message) { await this.stop(); this.emit('error', message); this.emit('ended', message); }
}
