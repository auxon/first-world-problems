# ☕ First World Problems

**A Sims-like comedy of modern existential crises**  
Built with **Three.js** + **TypeScript** + Vite

You are a delicate modern human. Your needs are not food or shelter — they are **Caffeine**, **Connectivity**, **Battery**, **Validation**, and **Vibe**.  

Manage your fragile existence. Click objects in your apartment. Solve (or create) first-world problems. Try not to have a total meltdown.

## How to Play

- **WASD / Arrow keys** — Move your character
- **Mouse drag** — Orbit the camera
- **Click furniture** — Interact (must be close enough)
- Keep the five need bars from hitting zero
- Random crises will interrupt your carefully curated life
- Survive as many days as you can and solve problems for score

### Interactables
- **Espresso Altar** — Brew the perfect latte (or doomscroll while waiting)
- **Standing Desk of Ambition** — Slack, LinkedIn, or actual deep work
- **Netflix Throne** — Binge or TikTok spiral
- **Sacred Charging Altar** — Restore battery or chase notifications
- **Judgmental Fiddle Leaf Fig** — Water it (or ignore it and feel guilt)
- **Mirror of Self-Worth** — Perfect selfie or existential crisis

## Run locally

```bash
cd first-world-problems
npm install          # if needed (three is loaded via CDN for simplicity)
npm run dev
```

Open the URL Vite prints (usually http://localhost:5173).

## Tech Notes

- Three.js r169 via CDN (no local install required for the 3D engine)
- TypeScript + Vite
- Pure procedural geometry — no external models
- Needs drain over time, random “First World Crisis” events, speech bubbles with punchlines, game-over meltdown screen

Made for maximum first-world irony and mild personal growth through virtual inconvenience.
