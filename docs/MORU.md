# Moru redesign

The rejected Lumi design is not included in this branch. Moru is a cream rabbit
with one folded ear, small dark eyes and short paws, built alongside the five
original Greus cats. This is a new visual proposal, not a claim of aesthetic approval.

The supplied video was inspected for simple silhouettes, squash/recovery timing
and overlapping ear motion. Its artwork is not included in the repository.
Moru uses flat SVG fills without glows, a star core, translucency or particles.
The body path deforms while feet stay planted; independent damped springs let
the ears and folded tip settle after the body. This is not a Cubism SDK asset.

The existing conversation phase and rendered PCM level drive listening and
speech. Automated checks cover geometry and interaction, not cuteness or style.
Live Gemini conversations and physical phone testing are outside the test scope.

Run `npm run typecheck`, `npm test`, and `npm run build:web` for the standard
checks. `tests/moru.browser.py` tests the isolated fixture and the application
with Playwright; screenshots and results are written to `artifacts/moru`.
