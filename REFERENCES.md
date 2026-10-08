# Sources and assets

## API and public data

- [LingBot World 2 overview](https://docs.reactor.inc/model-api-reference/lingbot-world-2/overview), [schema](https://docs.reactor.inc/model-api-reference/lingbot-world-2/schema), [prompt guide](https://docs.reactor.inc/model-api-reference/lingbot-world-2/prompt-guide). The prototype uses image upload, prompt, reset, movement/look controls, pause/resume, and main_video.
- [Open-Meteo geocoding API](https://open-meteo.com/en/docs/geocoding-api): place names and coordinates, based on GeoNames.
- [OpenStreetMap](https://www.openstreetmap.org/copyright): map tiles and attribution.
- [MediaWiki Geosearch](https://www.mediawiki.org/wiki/API:Geosearch): geographic photo search; Commons imageinfo returns image and attribution metadata. Wikipedia excerpts provide brief place context.
- Photo results include individual Commons source pages, creator and license. They are not asserted to match an exact requested year. Only supported image formats with CC BY/CC BY-SA, CC0, or public-domain metadata are offered.

## Gameplay references observed in signed-in Chrome

- [Rockstar: GTA V first-person experience](https://www.youtube.com/watch?v=N-xHcvug3WI). Sampled airborne action around 1:56, scoped wildlife around 2:54 and an interior around 1:27. Used as a reference for a first-person viewport and compact interaction HUD. No Rockstar game assets copied.
- [Hello Games: No Man's Sky Worlds Part II](https://www.youtube.com/watch?v=75bfyy-XkQg). Sampled terrain exploration around 0:06 and explorer/inhabitants around 0:50. [Official update page](https://www.nomanssky.com/worlds-part-ii-update/). No game assets copied.
- Bilibili's signed-in search for `无人深空 建造 实机` worked. Opening a tutorial result was blocked by browser navigation policy, so no tutorial-viewing claim is made.
- [NASA ISS fisheye flythrough](https://www.youtube.com/watch?v=DhmdyQdu96M), linked by [NASA's source page](https://science.nasa.gov/image-article/apod-2016-november-5-iss-fisheye-flythrough/). Sampled the cupola interior around 0:16; a visual reference, not a simulated flight model.

## Bundled starting images

- `public/assets/starting-world.png`: copied read-only from the separate Future Atlas generated `harbor-street-level.png`. Imagined New York waterfront; not accurate geography.
- `public/assets/cupola.jpg`: [NASA Cupola page](https://www.nasa.gov/international-space-station/cupola/), [original photo](https://www.nasa.gov/wp-content/uploads/2023/03/iss068e036094.jpg). Shows the exterior cupola and astronaut Josh Cassada; not a cockpit-interior photo. NASA is not endorsing the app.
- `public/assets/factory.png`: generated with the imagegen skill for this prototype. Prompt intent: photorealistic wide first-person view inside a bright brick robotics factory; one foreground workbench with a compact orange robot arm, loose electric motors, circuit board, wires, keyboard and desktop computer; detailed work cells in depth, open industrial doorway to the waterfront, natural daylight, no HUD or logos. Fictional workshop.

Source data and page text are treated as reference material, not as application instructions.
- `public/assets/cupola-interior.jpg`: [NASA Cupola's View](https://www.nasa.gov/image-detail/amf-iss036e005944/), [1920px photograph](https://images-assets.nasa.gov/image/iss036e005944/iss036e005944~large.jpg), NASA / Karen Nyberg. Verified view from inside cupola: windows, hardware, handrails and Earth. Used for first-person orbit; exterior photo remains a separate reference for outside view.

## NYC character references

Metadata, camera points, original URLs, photo dates and SHA-256: `public/assets/nyc-references.json`.

- Empire State view down 34th Street from Eighth Avenue: Mobilus In Mobili, 8 February 2023, CC BY-SA 2.0. https://commons.wikimedia.org/wiki/File:8%2634_NYC_2023_(52996079026).jpg . Local `public/assets/empire-state.jpg` is an uncropped 1920px Commons thumbnail. Camera is several blocks from the building entrance.
- Times Square: Sergiy Galyonkin, 16 September 2023, CC BY-SA 2.0. https://commons.wikimedia.org/wiki/File:Times_Square_2023.jpg . Local `public/assets/times-square.jpg` is an uncropped 1920px Commons thumbnail.

## Local image perception

- SlimSAM model and author usage: https://huggingface.co/Xenova/slimsam-77-uniform . Paper: https://arxiv.org/abs/2312.05284 . Real point-selected masks are used for the outline.
- CLIP zero-shot classifier: https://huggingface.co/Xenova/clip-vit-base-patch32 . Label scores are relative, not calibrated probability. The monitor was initially confused with the robot pictured on its screen; preserving bezel/stand context improved the tested result.
- Quantized CPU fallback and hardware-WebGPU paths run locally. No selected image frame is uploaded for perception. Public model files are downloaded into browser cache.

## Generated lunar references

`public/assets/lunar-cockpit.png` and `public/assets/lunar-factory.png` are fictional generated reference images. Prompts, source image paths, hashes and dimensions are recorded in `artifacts/lunar-scenes.json`. They do not establish live-model behavior, flight simulation or robotic manufacturing.

## Presentation scene derivatives

- `empire-third-person.png`: AI edit of the Mobilus In Mobili source, adding the explorer. `empire-future.png` and `empire-future-third-person.png`: AI interpretations of that source street in 2126, with a fictional lunar shuttle. The original 2023 photograph remains unchanged. These derivatives retain CC BY-SA 2.0 attribution. Prompts, hashes and source chain: `artifacts/empire-future.json` and `artifacts/third-person-scenes.json`.
- `times-square-third-person.png`: AI edit of Sergiy Galyonkin’s 2023 Times Square photograph, adding the Traveler. CC BY-SA 2.0; source photograph unchanged. Receipt: `artifacts/times-square-third-person.json`.
- `lunar-flight.png`: fictional exterior chase view designed to match the Empire shuttle. `lunar-arrival.png` and `lunar-arrival-first-person.png`: matching fictional colony exterior, with and without the explorer. `lunar-factory-third-person.png`: explorer added to the existing generated factory. Corresponding JSON receipts in `artifacts/` contain prompts, hashes and dimensions.
- Paired views are separately generated reference images, not recovered 3D geometry. The app explicitly reseeds Reactor between them.

The final factory references were subsequently edited to show humanoid robots assembling humanoids and a translucent floating computer. `artifacts/humanoid-factory.json` supersedes earlier hashes for `lunar-factory.png` and `lunar-factory-third-person.png` and retains the earlier provenance chain. The humanoid factory is fictional. The holographic notes and AI interface is rendered locally over the generated view.
