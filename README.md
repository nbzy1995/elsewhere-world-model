# Elsewhere

Open-world prototype built for the Reactor × Google World Models Hackathon, October 8, 2026.

```sh
git clone https://github.com/nbzy1995/elsewhere-world-model.git
cd elsewhere-world-model
cp .env.example .env.local
# Add your Reactor API key to .env.local
npm install
npm run dev
```

Open **http://127.0.0.1:5179/** in Chrome. It enters the Empire State street in third person and connects automatically. Location, time, characters and reference settings are inside the game. For local-only testing, open **http://127.0.0.1:5179/?preview=1**.

The server reads `REACTOR_API_KEY` from the shared parent `.env.local` (or this project's `.env.local`). The key stays on the server. Sessions end after five minutes; **End session** disconnects. Pausing retains the allocation.

## Controls

- **WASD:** move. **Drag / arrows:** look.
- **Click:** select an object. Recognized usable objects get an outer silhouette and two or three common actions. Background and ambiguous objects do not get a menu. **E:** use the selected object, take the visible boarding/arrival action, or select at the crosshair. **Esc:** cancel selection.
- **M:** map and destinations. **T:** change time in the same place. **Tab:** switch characters and return to their saved views.
- **C:** computer. Selecting a monitor and choosing **Use computer** smoothly approaches it before enabling typing. **Esc:** return to the world.
- **P:** imagine an object or change. **Enter:** describe an action. **1–4:** tools.
- **Space:** pause/resume. **V:** switch first / third person. Prepared scenes use paired references; other views are prompted. **F:** fullscreen.
- **Esc** with no other interaction open: world settings. This also contains reference-scene examples and custom-image upload.

Click the robot, choose **Work on robot**, install the four parts and power it on. Open the computer, train the tiny AI, and deploy it to the robot. A/B inputs drive the gripper through the trained network. Notes, weights and robot assembly persist in the browser.

## Presentation route

Start at the Empire State street. **Tab** switches to the Traveler in Times Square and back. **T → 2126** opens the matching future street. **E** boards the shuttle. **V** switches cockpit and exterior flight views. **E** lands at the lunar colony, then **E** enters the factory. **V** moves to the close first-person workspace. Click the monitor and choose **Use computer**, or click the robot to work on it.

The submission video combines recorded gameplay with clearly labeled generated draft sequences. Voice dialogue is a concept sequence, not an implemented NPC voice feature.

## Implementation and limits

LingBot World 2 on Reactor generates video from a reference image, visual prompts and camera controls. Model acknowledgements establish that requests arrived; they do not prove a visually correct response. There is no verified collision mesh, inventory or physical world simulation.

Object selection freezes the current video frame and runs SlimSAM and CLIP locally in a worker. The outline comes from the actual segmentation mask. Classification can be wrong. Unrecognized selections are dismissed instead of offering a generic interaction with every surface. Hardware-WebGPU tests took roughly 1.9–2.7 seconds for a fresh frame and 0.6 seconds for another object in the same held frame, after model loading. Downloads occur once per browser cache. CPU fallback is slower.

The authored holographic screen also has a fast cyan-frame detector. It uses the visible closed frame to form the outline before trying the general models. Both factory reference views and ten negative clicks passed its probe; this does not establish recognition of arbitrary holograms.

The computer appears as a floating cyan holographic interface, with editable notes and the small AI trainer. The computer and robot workbench run locally. Assembly, power gating, joint angle and signal controls are exact; physics and electrical simulation are not implemented. The computer trains a 2→6→1 neural network from four binary examples. Its output controls the gripper.

Travel retrieves Wikimedia Commons photos and Wikipedia context at runtime. The map uses OpenStreetMap and Open-Meteo/GeoNames search. Source/author/license remain visible. The two NYC character references were photographed in 2023; the game’s 2026 date is not a claim that the photographs show current conditions. Historical changes and future scenes are generated interpretations.

The Empire State 2026/2126 pair uses prepared references based on the same source photograph. The future and third-person characters are disclosed AI modifications. These time changes reset the model from the paired reference, as do the prepared first/third-person views and lunar scene transitions. Other years update the prompt; visible transformation requires verification. Character switching stores a view and world settings, then explicitly reseeds the model when returning. It is not a continuously simulated offscreen city.

NASA cupola references and generated lunar cockpit, exterior flight, colony and factory references are available inside the game. Generated assets alone do not prove flight, landing or robotic manufacturing.

The lunar factory depicts humanoid robots assembling other humanoids. Its foreground holographic computer is interactive; the exact local assembly fixture remains the small robot-arm workbench. The humanoid production line itself is generated scenery.

## Verification

Sources: [REFERENCES.md](REFERENCES.md). Build: `npm run build`. Local tests use `?preview=1`; `scripts/live-story-smoke.mjs` and `scripts/record-pickups.mjs` intentionally start and end live Reactor sessions.
