# CLAUDE.md

Guide for Claude Code working in this repository.

## What this is

Earth Online 2.0: a personal RPG-style weekly life tracker. React 19 + TypeScript 7 + Vite 8 single-page PWA, with no backend. All data lives in `localStorage` (`earth-online/v1`). ChatGPT (the "Game Master") is called directly from the browser with the user's own OpenAI API key.

Product context and the feature backlog: `README.md`, `docs/IDEAS.md`.

## Commands

```bash
npm run dev        # dev server
npm test           # vitest (src/**/*.test.ts)
npm run typecheck  # tsc
npm run build      # tsc + vite build → dist/
npm run smoke      # scripts/smoke.mjs: real-browser click-through of dist/ (needs Chrome or Edge, OpenAI mocked)
npm run nightly    # scripts/nightly.mjs: typecheck + tests + build + smoke + secret scan + audit
npm run save       # scripts/auto-commit.sh (commit all + push)
```

Before finishing a change, run `npm test` and `npm run build`. Both must pass. For anything that touches the UI, also run `npm run smoke` (after the build): unit tests cannot see a broken key handler or a layout that overflows at 390px. Run it with `SMOKE_SHOTS=<scratch dir>` and look at the screenshots when the look matters. When you add a screen or a flow, add it to `scripts/smoke.mjs`.

## Architecture: rules that matter

- **The ledger is the source of truth.** Stats are never stored. `computeStats(baseStats, ledger)` replays `LedgerEvent`s in order and floors at 0. Every point change must be a ledger event with a `source` (`checkin | task | achievement | adjust`). Undo means removing events.
- **XP = sum of positive deltas** over the ledger. Levels never go down. Curve: `xpForLevel(n) = 5·n·(n−1)/2`.
- **Weeks** are identified by the local date of their first day (`"2026-10-05"`), and `settings.weekStartsOn` picks Monday (1) or Sunday (0). Use `lib/week.ts`. Never use ISO week numbers or UTC dates.
- **One check-in per week.** `applyCheckIn` replaces any earlier check-in for that `weekId`, including its ledger event. The per-stat weekly cap (`capDeltas`) applies to the check-in only, not to tasks or achievements.
- **Achievements** are evaluated by `applyAutoAchievements` after every state-changing action, on load, and on import. It loops until stable because rewards can unlock more. Once unlocked they stay unlocked; only manual ones can be re-locked.
- **Stat milestones** (`STAT_MILESTONES` in `data/defaults.ts`) are generated: tiers 15/20/30 per stat (`statReaches`) plus "every stat" tiers (`allStatsReach`, progress = weakest stat). The Quests page hides later locked tiers (`laterTierIds`). New built-in content reaches existing saves through `state.seed` in `normalizeState`: bump `SEED_VERSION` and add once, so items a player deleted don't come back.
- **Quest suggestions** (`suggestQuests`) use the same key and model as the check-in. The prompt carries stats weakest-first, the last 8 weeks of gains and losses, existing tasks and the last 4 check-in schedules. Output goes through `parseQuestSuggestions` and waits in `state.suggestions` until accepted (becomes a `Task`) or dismissed.
- **Start & goodbye screens are skins** (`components/skins/`, chosen by `settings.skin`, registered in `skins/index.ts`). Each skin is a `Start` and a `Quit` component; the flow (intro timer, Enter starts from anywhere, any other key or a tap skips, one-shot enter, quit timer + `window.close()`) lives in `skins/shared.ts` so skins only decide looks. The start screen shows on every launch. `window.close()` only works in an installed PWA window; in a tab the goodbye stays up with a "Back to the game" button. Timings are constants at the top of each skin file and must match the CSS delays (`.splash…` for Classic, `.orbit…` for Orbit). Every skin root carries `data-screen="start|quit"` and its buttons `data-action="continue|return"`; the smoke test relies on those.
- **Orbit skin's Earth** (`skins/EarthCanvas.tsx`) is one WebGL fragment shader, no 3D library: a shaded disc textured with `public/earth.jpg` (NASA Blue Marble, public domain), plus procedural clouds, atmosphere, city lights and stars. "Camera moves" are `animateTo(view)` on the disc's centre and radius; `blend` zooms about a fixed screen point. It falls back to made-up continents until the texture loads and to a CSS planet without WebGL.
- **Week ids must share one grid.** When `weekStartsOn` changes, `alignWeeks` (reducer `updateSettings` and `normalizeState`) re-keys every stored `weekId`; `weeklySeries` also aligns and clamps, so its last point always equals `computeStats`. Comparing week ids from different grids silently drops events (this was the "flat chart" bug).
- **Titles**: a character is "Lv N <rank> <class>". Rank comes from level (`RANKS`, `rankTitle`); class from the highest stat (`classTitle`). `LevelGuide` lists both.
- **Toasts** (`components/Toasts.tsx`) announce level-ups and newly unlocked achievements by diffing each state against the previous one.
- **Character page stays minimal**: stat cards show name, value, weekly change and bar only. Description, next milestone, rules and manual adjust live in the `StatDetail` modal (`components/Modal.tsx`, a native `<dialog>`). Put new detail there, not on the card.
- **History chart** plots `withStartPoint(weeklySeries(...))`: end-of-week values plus the base stats as a "Start" point, otherwise first-week changes are invisible.
- **The reducer** (`state/store.tsx`) holds all state transitions. Pages dispatch actions and never mutate state. Keep scoring logic in `lib/scoring.ts` as pure functions with tests.
- **OpenAI** (`lib/openai.ts`): Chat Completions with `response_format: json_schema` (strict). The model output always goes through `parseAnalysis`, which drops unknown stats and task ids and clamps numbers. Never trust raw model output. The system prompt is built from the live rule book, so rule edits change the Game Master's behaviour.
- **API key**: stored only in `settings.openaiApiKey`. Never log it, and keep it out of exports (`exportData` blanks it).

## Stats & colors

`STAT_IDS` order (`int, str, vit, cre, soc, dis`) is also the chart color-slot order. Colors are CSS variables `--stat-<id>` in `src/styles.css`, with separate light and dark values taken from a CVD-validated categorical palette (slots 1–6). Assign colors in that slot order; never invent hues. To add a stat: extend `STAT_IDS`, `STATS`, `DEFAULT_BASE_STATS`, default rules, and add `--stat-<id>` to all three theme blocks in `styles.css` (slot 7 violet `#6250d6` / dark `#9085e9`).

## UI conventions

- Plain CSS in `src/styles.css` with tokens on `:root`, a dark theme via `prefers-color-scheme`, and a `data-theme` override. No CSS framework.
- Must work at a 390px phone width: below 640px the nav becomes a fixed bottom bar.
- Destructive actions use `confirm()`. Text never uses series colors; stat identity is a colored dot or bar next to text (`StatChip`).
- Tabs are routed via `location.hash` (`#character`, `#checkin`, `#quests`, `#history`, `#rules`, `#settings`).

## Repo workflow

- **Commit your own work before a turn ends**, with a message that says what changed and why (a short subject, then bullets for the separate changes). The owner does not want generic messages in the history. A **Stop hook** (`.claude/settings.json` → `scripts/auto-commit.sh`) commits whatever is still uncommitted and tries `git push -u origin HEAD`; treat it as a safety net, not as the way work gets committed.
- `.github/workflows/nightly.yml` runs `npm run nightly` every night (18:00 UTC).
- `vite.config.ts` uses `base: './'` so the build works under GitHub Pages' `/<repo>/` path. Keep asset URLs relative (`./icon.svg`).
- `.github/workflows/deploy.yml` runs tests and deploys `main` to GitHub Pages.
- `public/sw.js` is a minimal network-first service worker, registered in production only. Bump `CACHE` if caching behaviour changes.
