Hue Lines — Home Page

This is a simple one-page UI that shows a responsive grid of lights and provides per-light Play/Stop buttons.

Project Structure:
- `public/`: Static frontend files (index.html, style.css, app.js)
- `api/`: API route handlers (lights.js)
- `lib/`: Library code for Hue integration (hue.js)
- `server.js`: Express server
- `package.json`: Dependencies and scripts

Run the server:
```bash
npm run serve
```

Open http://localhost:3000/ to view the UI.

API Endpoints:
- GET /api/rooms — Get all rooms with their lights
- PUT /api/lights/:id/play — Start play for a light
- PUT /api/lights/:id/stop — Stop play for a light

Hue Integration:
- Update `lib/hue.js` with your Hue bridge IP and username.
- The API routes in `api/lights.js` use `lib/hue.js` to proxy calls to the Hue hub.
