# Hue Lines — Roadmap to Production

## What This Is

Hue Lines is a Node.js/Express app that controls Philips Hue lights with custom chase animations — both on light strips (gradient chase) and grouped individual bulbs (color cycling). It has a web UI, auto-discovery, bridge pairing, and chase group management built in.

The goal is to evolve it into a **reliable background service** that:
- Runs 24/7 on a Mac Mini (or any always-on machine)
- Supports **chase groups** (named combinations of chase animations with unified controls)
- Can be **scheduled** (auto-start at 6pm, auto-stop at 11pm)
- Is controllable from a **macOS menu bar app**, **Siri**, **phone**, or **web browser**
- Auto-deploys when code is pushed to GitHub

---

## Current State (What We Have Today)

### Completed

- [x] Express server serving a React frontend (no build step, Babel in-browser)
- [x] Hue bridge auto-discovery and key creation via the web UI
- [x] Connection banner with discovery + pairing flow when bridge is unreachable
- [x] Compact, redesigned UI with dark theme, collapsible rooms, inline light controls
- [x] Custom logos (horizontal for desktop, box for mobile) + favicons
- [x] **Tab system** in header bar: Rooms tab and Chase Groups tab
- [x] **Chase Sequences**: Ordered lists of individual bulbs that chase in sequence (e.g., 3-bulb lamp), created within rooms
- [x] **Chase Groups**: Higher-level containers that combine chase sequences + light strips
  - Unified speed/color controls that push to all members
  - Conflict resolution: activating a group auto-stops any conflicting groups sharing the same lights
  - State snapshot/restore: lights return to their pre-chase state when a group stops
  - Expandable cards with play/stop, speed slider, BG/chase color pickers
- [x] Chase animations on OmniGlow light strips (gradient point cycling, custom colors)
- [x] Chase animations on grouped individual bulbs (color cycling across bulbs)
- [x] Debug log modal (desktop only) — accessed via bug icon in header, with filter/clear/copy-error
- [x] Activity log intercepting all API calls with error details
- [x] Responsive design — mobile-friendly with logo swap, compact controls

### Architecture

```
Chase Group ("Office Blue")
├── Chase Sequence ("Office Lamp") → 3 individual bulbs chasing in order
├── Light Strip ("Desk Strip") → gradient chase on OmniGlow strip
└── Shared Settings: speed, bgColor, headColor
    ├── Pushes settings to all members on play
    ├── Saves/restores light states on play/stop
    └── Auto-stops conflicting groups
```

### Key Files
| File | Purpose |
|------|---------|
| `server.js` | Express server, mounts all API routes |
| `config.json` | Hue bridge IP + credentials |
| `sequences.json` | Saved chase sequences (ordered bulb lists) |
| `chaseGroups.json` | Saved chase groups (sequences + strips + settings) |
| `lib/hue.js` | Hue bridge API integration (dynamic config) |
| `lib/animations/groupChase.js` | Chase animation for bulb sequences |
| `lib/animations/omniglowChase.js` | Chase animation for light strips |
| `api/sequences.js` | Chase sequence CRUD + individual chase control |
| `api/chaseGroups.js` | Chase group CRUD + unified play/stop/speed/colors |
| `api/bridge.js` | Bridge discovery, validation, pairing, config save |
| `api/rooms.js` | Room listing from Hue bridge |
| `api/lights.js` | Individual light controls |

---

## Phase 2: Production Hardening

**Goal:** Make the app reliable enough to run unattended 24/7 without crashing or losing state.

### Tasks

- [ ] **Environment-based config** — Move sensitive/environment-specific values out of `config.json`:
  - `npm install dotenv`
  - Create `.env` file: `HUE_BRIDGE_IP`, `HUE_USERNAME`, `HUE_APPKEY`, `PORT`
  - Create `.env.example` with placeholder values (committed to repo)
  - Add `.env` to `.gitignore`
  - Keep `config.json` as a fallback / initial setup file that gets overwritten by env vars
- [ ] **Error recovery**:
  - If the bridge becomes unreachable mid-chase, pause the chase (don't crash)
  - Retry bridge connection every 30 seconds
  - When bridge comes back, resume paused chases
  - Wrap all Hue API calls in a retry wrapper with exponential backoff
- [ ] **Health check endpoint** — `GET /api/health`:
  ```json
  {
    "status": "ok",
    "bridge": { "ip": "192.168.1.x", "reachable": true },
    "chases": { "groups": 2, "strips": 1 },
    "uptime": 86400
  }
  ```
- [ ] **File-based logging**:
  - Use `pino` (fast, structured JSON logs) or a simple file appender
  - Log to `logs/hue-lines.log` with rotation
  - Keep console output for development
- [ ] **Lock down `package-lock.json`** — Commit it so installs are deterministic
- [ ] **Clean up dead code**:
  - Remove sample room data from `helpers.js` (no longer used)
  - Remove stale comments and unused variables
  - Remove the `index.js` placeholder file (server.js is the entry point)

### Files to Create/Modify
| File | Action |
|------|--------|
| `.env` | New — environment variables (gitignored) |
| `.env.example` | New — template (committed) |
| `.gitignore` | Modify — add `.env`, `logs/` |
| `lib/hue.js` | Modify — env var support, retry wrapper |
| `server.js` | Modify — dotenv init, health endpoint |
| `package.json` | Modify — add `dotenv`, `pino` |

---

## Phase 3: Git Workflow + Mac Mini Deployment

**Goal:** Push code on iMac → automatically deploys and restarts on Mac Mini.

### Prerequisites
- Mac Mini on the same network (or reachable via SSH)
- Node.js installed on Mac Mini
- SSH key from iMac to Mac Mini (for passwordless access)

### Tasks

- [ ] **GitHub repository** — Push the project to GitHub (private repo)
  - Ensure `.env`, `config.json`, and `logs/` are in `.gitignore`
- [ ] **Mac Mini initial setup**:
  - Clone the repo: `git clone git@github.com:user/hue-lines.git`
  - `npm install`
  - Create `.env` on the Mac Mini with the bridge credentials
  - Test: `node server.js` — verify it connects to the bridge
- [ ] **launchd service** — Create `com.hue-lines.server.plist`:
  ```xml
  <?xml version="1.0" encoding="UTF-8"?>
  <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "...">
  <plist version="1.0">
  <dict>
    <key>Label</key>
    <string>com.hue-lines.server</string>
    <key>ProgramArguments</key>
    <array>
      <string>/usr/local/bin/node</string>
      <string>/Users/larry/hue-lines/server.js</string>
    </array>
    <key>WorkingDirectory</key>
    <string>/Users/larry/hue-lines</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/Users/larry/hue-lines/logs/stdout.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/larry/hue-lines/logs/stderr.log</string>
  </dict>
  </plist>
  ```
  - Install: `cp com.hue-lines.server.plist ~/Library/LaunchAgents/`
  - Load: `launchctl load ~/Library/LaunchAgents/com.hue-lines.server.plist`
  - Now it auto-starts on boot and restarts on crash
- [ ] **Deploy script** — `scripts/deploy.sh`:
  ```bash
  #!/bin/bash
  # Run from iMac to deploy to Mac Mini
  MAC_MINI="larry@mac-mini.local"
  ssh $MAC_MINI "cd ~/hue-lines && git pull && npm install && launchctl kickstart -k gui/$(id -u)/com.hue-lines.server"
  echo "Deployed and restarted."
  ```
  - Usage: `./scripts/deploy.sh` after pushing to GitHub
- [ ] **Alternative: Auto-deploy via GitHub webhook**:
  - Small webhook listener on Mac Mini (can be a separate tiny Express app or use `webhook` CLI tool)
  - GitHub sends a POST on every push
  - Listener runs the deploy steps automatically
  - This means: push on iMac → Mac Mini updates within seconds, zero manual steps
- [ ] **Setup documentation** — `SETUP.md`:
  - Mac Mini prerequisites
  - Step-by-step first-time setup
  - How to check logs, restart, troubleshoot

### Files to Create/Modify
| File | Action |
|------|--------|
| `com.hue-lines.server.plist` | New — launchd service definition |
| `scripts/deploy.sh` | New — one-command deploy script |
| `SETUP.md` | New — Mac Mini setup guide |
| `.gitignore` | Modify — ensure secrets are excluded |

---

## Phase 4: macOS Menu Bar App

**Goal:** A lightweight native menu bar icon to control chase groups without opening a browser.

### Approach
A small SwiftUI macOS app that lives in the menu bar (top-right of screen, next to Wi-Fi, battery, etc.). It's not a dock app — just a small icon that shows a dropdown when clicked.

### Tasks

- [ ] **Create SwiftUI project** — Either in a `menubar/` subfolder or a separate repo
- [ ] **Menu bar icon** — Small lightbulb or Hue-style icon
- [ ] **Dropdown menu when clicked**:
  - Header: "Hue Lines" + connection status dot (green/red)
  - List of chase groups, each with a Play/Stop toggle
  - Divider
  - "Stop All" button
  - "Open Web UI" → opens `http://localhost:3000` in browser
  - "Quit" option
- [ ] **API integration** — All actions are HTTP calls to `localhost:3000/api/chase-groups/...`
- [ ] **Auto-refresh** — Poll `/api/chase-groups` every few seconds to keep status current
- [ ] **Build as `.app`** — Distribute as a standalone macOS app
- [ ] **Add to Login Items** — So it launches automatically on boot
- [ ] **Optional: Global keyboard shortcut** — e.g., `⌥⇧H` to toggle favorite chase group

### Technical Notes
- SwiftUI's `MenuBarExtra` (macOS 13+) makes this very simple — about 100-200 lines of Swift
- Uses `URLSession` for HTTP calls to the local API
- No authentication needed (localhost only)
- Could also be built as an Electron app if you prefer JS, but SwiftUI is lighter and more native

### Files to Create
| File | Action |
|------|--------|
| `menubar/HueLines/` | New — Xcode project |
| `menubar/HueLines/HueLinesApp.swift` | New — App entry point with MenuBarExtra |
| `menubar/HueLines/ChaseGroupService.swift` | New — HTTP client for the chase groups API |
| `menubar/HueLines/ContentView.swift` | New — Menu dropdown UI |

---

## Phase 5: Siri & Voice Control

**Goal:** Control chase groups with voice — "Hey Siri, run Office Blue."

### Option A: Siri Shortcuts (simplest, no extra software)

- [ ] **Create Siri Shortcuts manually** on iPhone/Mac:
  - New Shortcut → "Get Contents of URL"
  - URL: `http://huechaser.duckdns.org/api/chase-groups/CHASE_GROUP_ID/play`
  - Method: PUT
  - Name the shortcut "Office Blue" (or whatever the chase group is called)
  - Now "Hey Siri, Office Blue" triggers it
- [ ] **Create a "Stop All" shortcut** — same pattern, hits `/api/chase-groups/stop-all`
- [ ] **Document the setup** — Step-by-step with screenshots
- [ ] Works from anywhere via `huechaser.duckdns.org`

### Option B: Homebridge Plugin (deeper Apple integration)

- [ ] **Install Homebridge** on Mac Mini — `npm install -g homebridge`
- [ ] **Write a Homebridge plugin** — `homebridge-hue-lines`:
  - Exposes each chase group as a HomeKit switch (on = playing, off = stopped)
  - Talks to `localhost:3000/api/chase-groups`
  - When you flip the switch in Apple Home, it calls play/stop
- [ ] **Benefits of HomeKit**:
  - Siri works natively: "Hey Siri, turn on Office Blue"
  - Apple Home app on iPhone/iPad/Mac shows chase group switches
  - Home automations: "When I arrive home, turn on Welcome chase"
  - Works with Alexa via Amazon's HomeKit bridge
  - Works from anywhere (Apple Home uses iCloud relay)
- [ ] **Install and configure** — Add plugin to Homebridge config

### Option C: Remote Access (for controlling outside the house)

- [ ] **Tailscale** — Install on iMac and Mac Mini, creates a private network
  - Access Mac Mini API from anywhere: `http://100.x.x.x:3000/api/...`
  - Free for personal use, zero config
- [ ] **Or Cloudflare Tunnel** — Expose the API via a subdomain
  - e.g., `https://hue.yourdomain.com/api/...`
  - More setup but works without a client app installed

---

## Phase 6: Scheduling

**Goal:** Chase groups can auto-start and auto-stop on a time schedule.

### Tasks

- [ ] **Add dependency** — `npm install node-cron`
- [ ] **Scheduler module** — `lib/scheduler.js`:
  - Manages cron jobs for chase group start/stop
  - On server start, reads all chase groups with schedules and creates cron jobs
  - When a schedule is updated, recreates the relevant cron jobs
- [ ] **Extend chase group data model** — Add optional schedule fields:
  ```json
  {
    "schedule": {
      "startTime": "18:00",
      "stopTime": "23:00",
      "days": ["mon", "tue", "wed", "thu", "fri"],
      "enabled": true
    }
  }
  ```
- [ ] **API endpoints** — Add to `api/chaseGroups.js`:
  - `PUT /api/chase-groups/:id/schedule` — Set or update a chase group's schedule
  - `DELETE /api/chase-groups/:id/schedule` — Remove a chase group's schedule
- [ ] **Frontend: Schedule UI** — Add to ChaseGroupCard expanded view:
  - Time pickers for start/stop time
  - Day-of-week toggles (M T W T F S S)
  - Enable/disable toggle for the schedule
  - Visual indicator showing when a chase group is scheduled vs. manually playing
- [ ] **Persistence** — Schedules are saved in `chaseGroups.json` and restored on server restart

### Files to Create/Modify
| File | Action |
|------|--------|
| `lib/scheduler.js` | New — cron job management |
| `api/chaseGroups.js` | Modify — add schedule endpoints |
| `public/components/ChaseGroupCard.js` | Modify — add schedule UI |
| `package.json` | Modify — add `node-cron` dependency |

---

## Phase 7: SSL / HTTPS

**Goal:** Secure external access with HTTPS.

- [ ] **Install Caddy** on Mac Mini — single binary reverse proxy with automatic SSL
- [ ] **Configure Caddy** to proxy `huechaser.duckdns.org` → `localhost:7483`
- [ ] Caddy auto-obtains and renews Let's Encrypt certificates via DuckDNS DNS challenge
- [ ] Update Eero port forward: external 443 → Mac Mini's Caddy port
- [ ] Access becomes `https://huechaser.duckdns.org` — no port, no browser warnings

---

## Phase 8: Polish & Future Ideas

**Goal:** Nice-to-haves once everything is running solid.

- [ ] **More animation types**:
  - Breathe (slow brightness fade in/out)
  - Rainbow cycle (hue rotation across the group)
  - Random sparkle (random bulbs flash randomly)
  - Wave (smooth color wave instead of hard chase)
- [ ] **Chase group transitions** — Fade between chase groups instead of hard cut
- [ ] **Web UI improvements**:
  - Dedicated chase group management page
  - Dark/light theme toggle
- [ ] **Frontend build system** — Migrate to Vite + React for hot reload, proper imports, and better DX (only worth it if the project keeps growing)
- [ ] **Apple Watch complication** — Quick chase group toggle from wrist
- [ ] **Alexa skill** — If Homebridge route doesn't cover Alexa well enough
- [ ] **Widget** — macOS desktop widget showing current chase group status

---

## Summary Table

| Phase | What | Depends On | Effort |
|-------|------|------------|--------|
| ~~1. UI + Chase Groups~~ | ~~Redesign UI, chase sequences, chase groups~~ | ~~Nothing~~ | ~~Done~~ |
| ~~2. Hardening~~ | ~~Error recovery, logging, health check, cleanup~~ | ~~Nothing~~ | ~~Done~~ |
| ~~3. Deployment~~ | ~~Git + launchd + poll deploy + DuckDNS on Mac Mini~~ | ~~Phase 2~~ | ~~Done~~ |
| 4. Menu Bar | SwiftUI menu bar app | Done | Medium |
| 5. Voice | Siri Shortcuts + Homebridge | Done | Small-Medium |
| 6. Scheduling | Auto start/stop chase groups by time | Done | Small |
| 7. SSL | Let's Encrypt via Caddy for huechaser.duckdns.org | Done | Small |
| 8. Polish | More animations, transitions | Everything | Ongoing |

**Next up:** 4 → 5 → 6 → 7 → 8

### Deployment Details (Completed)
- **Mac Mini**: `plex@192.168.0.50` (hostname: `mac-mini` via /etc/hosts on iMac)
- **Server**: Runs on port 7483 via launchd (`com.hue-lines.server`)
- **Auto-deploy**: Poll script checks GitHub every 60s (`com.hue-lines.poll`)
- **DuckDNS**: `huechaser.duckdns.org` → public IP, updated every 5 min (`com.hue-lines.duckdns`)
- **Port forward**: Eero forwards external port 80 → `192.168.0.50:7483`
- **Local access**: `http://mac-mini:7483` or `http://192.168.0.50:7483`
- **External access**: `http://huechaser.duckdns.org`
