# Lumi - starlight companion

Lumi is an original mint-and-lavender jelly spirit with a small warm star inside.
Patient, observant, and quietly curious, Lumi celebrates small discoveries without
pressuring the user to keep talking. The references inform softness, translucent
light, and expressive simplicity; none of the supplied GIF artwork is embedded.

## Integration

Choose Lumi in the existing Character picker. The five Greus Cat coats and their
saved IDs remain intact. Lumi uses the existing 26-emotion protocol and seven
motion IDs, with species-specific action labels. Selection and sessions use the
existing persistence system. The server persona whitelist, default/native voice
direction, and animated-mascot voice direction all know Lumi as a spirit, not a cat.
No API keys, persona prompts, additional runtime packages, or external assets are
added to the browser bundle.

## Rig and precedence

`lumiModel.ts` owns finite numeric pose targets and deterministic action sampling.
`Lumi.tsx` updates cached semantic SVG nodes from one animation frame loop. Every
eye and mouth uses fixed M-C-C-Z topology. Retargeting starts from the current
interpolated pose rather than replacing an expression layer. Exact endpoints avoid
floating-point drift, and elapsed-time damping behaves consistently at different
refresh rates.

Speech/listening/thinking/connection activity interrupts idle actions. Non-idle
emotions do not auto-play cheerful actions. One-shots settle back to rest and can
be replayed from Motion Lab. Only rendered PCM above the existing 0.012 threshold
opens the speaking mouth; silence closes it, while emotional eyes remain intact.
The microphone moves the antenna only during listening.

Reduced motion stops spontaneous floating, breathing, blinking and action loops.
Expressions and PCM mouth states remain readable; petting uses short static
feedback. Hidden tabs suspend the frame loop. Unmount cleans up the frame, media
query listener, visibility listener and pet-feedback timer. Picker thumbnails are
static, noninteractive and have separate SVG definition IDs.

## Verification

```sh
npm ci
npm run typecheck
npm test
npm run build:web
python -m pip install playwright==1.57.0
python -m playwright install --with-deps chromium firefox webkit
npm run dev
# In a second terminal:
python tests/lumi.browser.py --browsers chromium firefox webkit
```

The test fixture is served only by the development server at
`/tests/fixtures/lumi.html`; it is not a production entry. Browser screenshots and
assertion reports are saved in `artifacts/lumi/` and uploaded by Lumi character QA.

Unit coverage includes all 676 ordered emotion pairs, intensity bounds, invalid
numeric inputs, interruption, seven action endpoints, audio gating, reduced motion,
server persona parity and multi-instance SVG IDs. Browser coverage includes all
26 rendered emotions, seven actions, rapid retargeting, keyboard/pointer petting,
frame-loop cleanup, synthetic PCM, real picker/persistence/demo integration and
360/390/768-pixel layouts. No real Gemini voice session or physical mobile device
is claimed by these tests; those depend on deployment credentials and hardware.

The optional offline specimen can be built with
`npx vite build --config tests/lumi.vite.mts`, then checked with
`python tests/lumi.browser.py --offline --chromium-executable /usr/bin/chromium`.
This mode tests the isolated component, not the application or server endpoints.
