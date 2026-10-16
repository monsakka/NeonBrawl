# Zone Wars — Fighter

A 3D Fortnite-style "Zone Wars" endgame prototype: grid building, 3x3 wall editing,
a moving storm, hitscan combat and a 5-round tournament against 9 bots.

Stack: Vite + TypeScript + Three.js + `@dimforge/rapier3d-compat`.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production bundle in dist/
```

## Controls

| Key | Action |
| --- | --- |
| WASD / Shift / Space / Ctrl | move / sprint / jump / crouch |
| Mouse, LMB, RMB | look, fire (or place a piece), aim down sights |
| 1-4, mouse wheel | pickaxe, assault rifle, tactical shotgun, slurp juice |
| R | reload (build mode: rotate ramp) |
| Z / X / C / V | wall / floor / ramp / cone (enters build mode, hold LMB to turbo build) |
| Q | toggle build mode, RMB in build mode cycles wood / brick / metal |
| G | edit the aimed wall/floor, click or drag tiles, G again to confirm, RMB resets |
| Tab | tournament standings |
| F | fast-forward while spectating |

## Layout (`src/`)

| File | Responsibility |
| --- | --- |
| `main.ts` | renderer, lights + shadow maps, fixed-step tick loop, wiring |
| `config.ts` | every tuning number: grid, materials, weapons, storm phases, scoring |
| `core/` | Rapier wrapper (`Physics`), input + pointer lock, WebAudio SFX, events, textures |
| `player/PlayerController.ts` | third-person camera with collision, movement, mode/input routing |
| `actors/` | `Actor` (capsule + character controller, health/shield, damage) and `Avatar` rig |
| `building/Grid.ts` | 4 m grid maths, occupancy keys, support segments |
| `building/BuildPiece.ts` | piece meshes/colliders built from a tile mask |
| `building/BuildingSystem.ts` | targeting, ghost preview, placement, damage, structural collapse |
| `building/EditSystem.ts` | 3x3 (wall) / 2x2 (floor) tile editing overlay |
| `storm/StormManager.ts` | shrinking + shifting storm, wall shader, tick damage |
| `weapons/CombatSystem.ts` | hitscan with bloom, shotgun falloff, pickaxe harvesting, slurp |
| `ai/` | bots: zone rotation, target selection, strafing, wall-up when shot |
| `game/` | round loop and tournament scoring |
| `ui/HUD.ts` | vitals, hotbar, mats, crosshair bloom, minimap, kill feed, scoreboard, menus |

Storm damage ignores shields by default, as in Fortnite. Set `STORM_IGNORES_SHIELD`
in `config.ts` to change that. A debug handle is exposed as `window.zw` in the console.
