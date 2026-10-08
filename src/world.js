export const CURRENT_YEAR = 2026;
export const SCENES = {
  city: { name: 'City street', image: '/assets/empire-state.jpg', thirdPersonImage: '/assets/empire-third-person.png', environment: 'A real New York street at night, looking down 34th Street toward the illuminated Empire State Building. Contemporary buildings and vehicles, bright storefronts and a recognizable skyline.', credit: 'Empire State view · Mobilus In Mobili · CC BY-SA 2.0 · 2023' },
  empireFuture: { name: 'New York, 2126', image: '/assets/empire-future.png', thirdPersonImage: '/assets/empire-future-third-person.png', environment: 'The same New York street and recognizable Empire State Building, imagined in 2126. Planted facades and elegant future architecture. A compact ivory and graphite lunar shuttle waits in the street, with amber accents, a black panoramic windshield, two thruster pods, three landing legs and an open side hatch with a boarding ramp. Preserve this spacecraft design.', credit: 'AI future interpretation of Mobilus In Mobili’s 2023 photo · CC BY-SA 2.0' },
  factory: { name: 'Robotics factory', image: '/assets/factory.png', environment: 'Inside a bright brick robotics factory. One metal workbench in the foreground has a compact orange robot arm, a circuit board, two small electric motors and a desktop computer. The open industrial doorway is behind and to the left. Detailed tools, ceiling beams and work cells.', credit: 'Fictional robotics workshop · generated starting image' },
  orbit: { name: 'Earth orbit', image: '/assets/cupola-interior.jpg', exteriorImage: '/assets/cupola.jpg', environment: 'A space station above the curved blue Earth. A seven-windowed cupola, blue handrails, detailed window frames, bolts, padded covers, white metal modules, reflective thermal blankets, large solar panels, black space and bright sunlight.', credit: 'Starting photo: NASA / Karen Nyberg · ISS cupola interior', source: 'https://www.nasa.gov/image-detail/amf-iss036e005944/' },
  spacecraft: { name: 'Lunar flight', image: '/assets/lunar-cockpit.png', exteriorImage: '/assets/lunar-flight.png', environment: 'A compact ivory and graphite lunar shuttle with amber accents, black panoramic cockpit windshield and two rear thruster pods approaches the vast cratered Moon. Earth is visible off to the side. Preserve the same spacecraft design and convincing scale. Inside, physical flight controls, control sticks, cables, screens and window frames.', credit: 'Fictional lunar spacecraft · generated reference' },
  lunarArrival: { name: 'Lunar colony', image: '/assets/lunar-arrival-first-person.png', thirdPersonImage: '/assets/lunar-arrival.png', environment: 'Outside a bright off-white and graphite robotics factory on the Moon. Hard low sunlight, gray lunar ground, Earth in the black sky. A clear lit walkway leads toward a large open airlock. Humanoid robots and humanoid assembly fixtures are visible inside. The same compact ivory and graphite shuttle is parked beside the walkway.', credit: 'Fictional lunar colony · generated reference' },
  lunarFactory: { name: 'Lunar robotics factory', image: '/assets/lunar-factory.png', thirdPersonImage: '/assets/lunar-factory-third-person.png', environment: 'Inside a large bright lunar humanoid robotics factory. Complete humanoid robots assemble other humanoids on production fixtures: heads, torsos, articulated hands and legs, visible cables and parts racks. A foreground workbench has a small orange robot arm, loose motors and circuit boards. On the right, a floating translucent cyan holographic computer display above a small emitter, with a clear rectangular luminous edge and editable technical diagrams. Preserve the holographic screen and working humanoid assembly lines. Gray lunar terrain and Earth are visible through the windows. White industrial architecture and realistic detailed hardware.', credit: 'Fictional lunar factory · generated reference' },
};
export function sceneImage(world) {
  const scene = SCENES[world.scene];
  if (world.reference) return world.view === 'outside' && world.reference.thirdPersonImage ? world.reference.thirdPersonImage : world.reference.image;
  return world.view === 'outside' ? scene.exteriorImage || scene.thirdPersonImage || scene.image : scene.image;
}
export function eraLabel(year) {
  return year > CURRENT_YEAR ? 'SPECULATIVE FUTURE' : year < CURRENT_YEAR ? 'IMAGINED HISTORICAL RECONSTRUCTION' : 'IMAGINED PLACE';
}
export function formatYear(year) { return year < 0 ? `${Math.abs(year)} BCE` : String(year); }
export function composePrompt(world, moving = false) {
  const space = ['orbit', 'spacecraft', 'lunarArrival', 'lunarFactory'].includes(world.scene);
  const era = space ? 'Realistic aerospace hardware and industrial materials. Airless lunar exterior, black sky, hard sunlight. Pressurized interiors have clear air and practical lighting.' : world.year > CURRENT_YEAR ? 'Speculative future: planted buildings, elevated pedestrian bridges, sleek electric transport, white ceramic and glass materials, small service robots.' : world.year < 1800 ? 'Historical interpretation: stone and timber structures, handmade tools, carts, natural-fiber clothing, lanterns and warm daylight.' : world.year < 1950 ? 'Historical interpretation: brick and stone facades, vintage motor cars, shop awnings, people in long wool coats and brimmed hats, handmade wooden storefronts, warm daylight.' : world.year < CURRENT_YEAR ? 'Historical interpretation: buildings, tools, vehicles and clothing characteristic of this period.' : 'Contemporary architecture, clothing and transport.';
  const base = `${world.environment || ''} ${world.place}, year ${formatYear(world.year)}. ${era} Photorealistic, natural light, convincing scale and materials.`;
  const reference = world.reference ? `Visual reference: ${world.reference.title.slice(0, 160)}. Preserve recognizable buildings and landscape from the reference image. Source description: ${world.reference.description.slice(0, 140)}. ${world.reference.context ? 'Place context: ' + world.reference.context.text.slice(0, 200) : ''}` : '';
  const camera = world.vehicle === 'spacecraft' ? 'First-person pilot seat inside the spacecraft. Physical controls below, Moon through the windshield. Movement input steers the craft; look-input changes gaze inside the cockpit.' : moving
    ? 'Strict first-person view. The viewpoint advances through the scene only in response to movement input; look-input changes heading. Buildings and objects stay fixed in the world.'
    : 'First-person eye-level view. The viewpoint stays in place. Look-input is the only source of camera rotation, only while held. People make small natural idle movements; leaves gently stir.';
  const subject = world.vehicle === 'spacecraft' ? 'the same ivory and graphite spacecraft, with two amber rear thrusters' : world.vehicle === 'car' ? 'the car' : space ? 'the explorer in a warm-gray pressure suit with a compact amber-accent backpack' : world.characterId === 'traveler' ? 'the traveler wearing a muted rust-brown jacket, charcoal trousers and a compact teal-accent backpack' : 'the explorer wearing a warm-gray jacket, charcoal trousers and a compact amber-accent backpack';
  const view = world.view === 'outside' ? `Third-person game camera behind and slightly above ${subject}. Keep the player fully visible in the lower center, about a quarter of the frame height. ${moving ? 'Movement input moves the player forward, backward or sideways and the camera follows at a steady distance.' : 'Player and camera stay in place with subtle natural idle movement.'} Look-input rotates the view. Keep the same surroundings, character appearance and proportions.` : '';
  const hand = world.view === 'outside' ? 'in the visible player’s right hand' : 'in the right hand near the bottom of the frame';
  const tool = world.tool === 'scanner' ? `A compact scanning instrument ${hand}.` : world.tool === 'builder' ? `A small precision construction tool ${hand}.` : world.tool === 'sidearm' ? `A compact science-fiction sidearm held safely downward ${hand}.` : '';
  const additions = world.dreams.slice(-3).map(x => x.slice(0, 240)).join(' ');
  const action = world.action ? `The next visible action: ${world.action.slice(0, 500)}` : '';
  return [action, base, world.view === 'outside' ? view : camera, reference, tool, additions].filter(Boolean).join(' ').slice(0, 1950);
}

// Small actual trainable neural network, not a canned result. Tanh hidden units + sigmoid output.
export class TinyNetwork {
  constructor(saved) {
    this.w = saved?.w || Array.from({ length: 6 }, (_, i) => [Math.sin(i * 13 + 1) * .7, Math.cos(i * 7 + 2) * .7, Math.sin(i + 3) * .3]);
    this.v = saved?.v || Array.from({ length: 7 }, (_, i) => Math.sin(i * 4 + 1) * .6);
    this.epochs = saved?.epochs || 0;
  }
  forward(a, b) {
    const hidden = this.w.map(([x, y, bias]) => Math.tanh(a * x + b * y + bias));
    const output = 1 / (1 + Math.exp(-(hidden.reduce((sum, h, i) => sum + h * this.v[i], this.v[6]))));
    return { hidden, output };
  }
  train(targets, epochs = 6000) {
    const inputs = [[0, 0], [0, 1], [1, 0], [1, 1]]; const rate = .15;
    for (let e = 0; e < epochs; e++) for (let j = 0; j < 4; j++) {
      const [a, b] = inputs[j], { hidden, output } = this.forward(a, b);
      const delta = output - targets[j];
      const hiddenDelta = hidden.map((h, i) => delta * this.v[i] * (1 - h * h));
      for (let i = 0; i < 6; i++) { this.v[i] -= rate * delta * hidden[i]; this.w[i][0] -= rate * hiddenDelta[i] * a; this.w[i][1] -= rate * hiddenDelta[i] * b; this.w[i][2] -= rate * hiddenDelta[i]; }
      this.v[6] -= rate * delta;
    }
    this.epochs += epochs;
    const predictions = inputs.map(([a, b]) => this.forward(a, b).output);
    const loss = -predictions.reduce((sum, p, i) => sum + targets[i] * Math.log(p + 1e-8) + (1 - targets[i]) * Math.log(1 - p + 1e-8), 0) / 4;
    return { predictions, loss, epochs: this.epochs };
  }
  serialize() { return { w: this.w, v: this.v, epochs: this.epochs }; }
}
