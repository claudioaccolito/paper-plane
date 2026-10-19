# Paper Plane

A tiny 3D browser game: steer a paper plane through low-poly clouds and catch the lights. No game over, just flying.

**Play:** https://claudioaccolito.github.io/paper-plane/

- The sky follows the real time of day: dawn, day, sunset, and a starry night with the moon.
- Mouse, touch drag or arrow keys/WASD. `M` mutes, `P` pauses.
- Sounds are synthesized with the Web Audio API; no audio files.
- Best score is stored only in your browser.

URL parameters: `?t=21` forces the hour, `?ciclo` runs a full day in about two minutes, `?vola` skips the intro.

## Files

- `index.html`, `style.css` — page and UI
- `js/` — sky (`sky.js`), plane (`plane.js`), clouds and lights (`world.js`), sparkles (`particles.js`), sound (`audio.js`), game loop (`main.js`)
- `vendor/three.module.min.js` — Three.js r170 (MIT), self-hosted

Static files, no build step and no external requests. To run locally: `python -m http.server` and open http://localhost:8000.
