# দুরুদের সফর

Durud-counting app (PWA), deployed on Netlify at durud-tracker.netlify.app.

- `public/` is the site: `index.html` (the whole app), `sw.js`, `manifest.webmanifest`, icons, fonts and `.well-known/assetlinks.json` for the Android app.
- `netlify/functions/` holds the server code for daily reminder notifications.
- Bump `CACHE` in `public/sw.js` on every release so phones pick up the new version.
