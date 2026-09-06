# Low-poly 3D companion preview

This branch deliberately preserves `main`. The default entry opens the 3D studio;
`?view=classic` opens the existing 2D application. No Gemini SDK version, PCM
transport, microphone gate, token broker, or recovery policy is replaced.

## Implemented

Five original procedural humanoid chibi characters, based on the broad proportions
of the supplied reference videos, not extracted/recovered models from those videos.
Each has 31-32 named rigid joints, 26 interpolated expressions and seven motion
presets. Head, ears, hair locks, elbows, legs, mouth and tail are separate nodes.
This is a hierarchical rigid-part rig, not Blender weighted skinning. Clothing and
hair are intentionally simplified compared with the reference videos.

The renderer uses local WebGL geometry with no third-party asset/CDN dependency.
When WebGL is unavailable, a Canvas software renderer projects the same 3D mesh.
The software fallback is for compatibility, not an ESP32 performance benchmark.
Drag to rotate. Use the expression and motion controls without an API key.
Export `.gltf` to inspect/edit the current mesh, materials and hierarchy in a DCC.
The snapshot export does not bake animation clips: controller source is `rig.ts`.

## Live conversation

Settings reuse the existing API-key store, model catalog and voice selector. The
same Gemini 2.5 and 3.1 connections are used. `onExpression` drives facial targets;
`AudioEngine.onOutputLevel` drives mouth opening only in `speaking`. Input microphone
levels do not drive mouth animation. This is amplitude-synchronized animation, not
phoneme/viseme recognition. Transcribed gesture requests can trigger wave/dance/nod.
A visual avatar change keeps the existing matching persona ID and reconnects only
if a session was active. A chat-only session does not silently enable a microphone.

The existing user-name setting and proactive scheduler are reused. On a new Vercel
preview origin, browser-local settings are separate from the production hostname:
enter the name and API key again there. Never commit a real API key or reference
recording to this repository.

## Verification

`npm run typecheck`, `npm test`, `npm run build:web`.
`tests/lowPolyRig.test.ts` covers geometry bounds, all emotion IDs, interpolation,
intensity, mouth gating, repeated pose evaluation and glTF byte/accessor validity.
The separate `Verify 3D companion preview` workflow exercises the built app in
Chromium, both WebGL and forced software fallback, and uploads screenshots/results.
It checks character/expression/motion selection, nonblank rendered pixels, glTF
export, user-name persistence, mobile layouts and missing-key handling. It does not
call Google or claim that a physical Android speaker/microphone was tested.

## ESP32-S3 feasibility: a separate target

This React/WebGL application cannot be copied directly onto an ESP32-S3. S3 is a
240 MHz dual-core MCU with 512 KB internal SRAM and external PSRAM support, not a
browser/WebGL host. Installed PSRAM, LCD resolution/interface, flash and audio
hardware are needed to size a firmware target.

Recommended production route: retain these editable 3D source rigs on the PC,
pre-render motion/expression frames for the MCU, then combine eye/mouth overlays
with playback-level lip animation. Alternatively port a much simpler mesh and a
CPU renderer to C/C++, with a fixed camera, flat materials, reduced joints and an
explicit frame/triangle budget. Neither route is implemented/benchmarked here.

RGB565 frame cost (before depth, meshes, audio, Wi-Fi and TLS):

- 240 x 240 x 2 = 115,200 bytes = 112.5 KiB; double-buffer = 225 KiB.
- 320 x 240 x 2 = 153,600 bytes = 150 KiB; double-buffer = 300 KiB.

The browser's rendered triangle count is reported live. It is not an S3 FPS claim.
Gemini reasoning and speech generation remain cloud services, also for an MCU port.

Official hardware references:
- https://www.espressif.com/en/products/socs/esp32-s3
- https://docs.espressif.com/projects/esp-idf/en/stable/esp32s3/api-reference/peripherals/lcd/index.html
- https://docs.espressif.com/projects/esp-idf/en/stable/esp32s3/api-guides/external-ram.html
