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
- Update `config.json` with your Hue bridge IP and credentials.
- The API routes in `api/lights.js` use `lib/hue.js` to proxy calls to the Hue hub.

## Getting New Hue Bridge API Keys

If you get a new Hue Bridge (or Bridge Pro), follow these steps to get new API credentials:

### Step 1: Find Your Bridge IP Address

Choose one of these methods:
- Visit https://discovery.meethue.com/ in your browser
- Check your router's DHCP client list
- Use the Hue app: Settings → Bridge settings → Network settings

### Step 2: Create API Credentials

1. **Press the physical button on top of your Hue Bridge**

2. **Within 30 seconds**, run the appropriate command for your bridge:

**For Hue Bridge Pro (v2):**
```bash
curl -k https://YOUR_BRIDGE_IP/api -H "Content-Type: application/json" -d '{"devicetype":"hue-lines#app","generateclientkey":true}'
```

**For older Hue Bridges (v1):**
```bash
curl -X POST http://YOUR_BRIDGE_IP/api -H 'Content-Type: application/json' -d '{"devicetype":"hue-lines#app"}'
```

3. You'll get a response like:
```json
[{"success":{"username":"abc123...","clientkey":"xyz789..."}}]
```

### Step 3: Update config.json

Copy the credentials from the response:
- `username` → use as both `username` and `appkey` in `config.json`
- `clientkey` → use as `appkey` in `config.json` (if provided)

For Hue Bridge Pro, you'll get both values. For older bridges, just use the `username` for both fields.

**⚠️ Important:** Keep these credentials secure and don't commit them to public repositories!
