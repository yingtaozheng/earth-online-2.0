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
npm run save       # scripts/auto-commit.sh (commit all + push)
```

Before finishing a change, run `npm test` and `npm run build`. Both must pass.

## Architecture: rules that matter

- **The ledger is the source of truth.** Stats are never stored. `computeStats(baseStats, ledger)` replays `LedgerEvent`s in order and floors at 0. Every point change must be a ledger event with a `source` (`checkin | task | achievement | adjust`). Undo means removing events.
- **XP = sum of positive deltas** over the ledger. Levels never go down. Curve: `xpForLevel(n) = 5·n·(n−1)/2`.
- **Weeks** are identified by the local date of their first day (`"2026-10-05"`), and `settings.weekStartsOn` picks Monday (1) or Sunday (0). Use `lib/week.ts`. Never use ISO week numbers or UTC dates.
- **One check-in per week.** `applyCheckIn` replaces any earlier check-in for that `weekId`, including its ledger event. The per-stat weekly cap (`capDeltas`) applies to the check-in only, not to tasks or achievements.
- **Achievements** are evaluated by `applyAutoAchievements` after every state-changing action, on load, and on import. It loops until stable because rewards can unlock more. Once unlocked they stay unlocked; only manual ones can be re-locked.
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

- A **Stop hook** (`.claude/settings.json` → `scripts/auto-commit.sh`) auto-commits all changes at the end of every turn and tries `git push -u origin HEAD`. You don't need to commit manually unless you want a hand-written message for a meaningful change.
- `vite.config.ts` uses `base: './'` so the build works under GitHub Pages' `/<repo>/` path. Keep asset URLs relative (`./icon.svg`).
- `.github/workflows/deploy.yml` runs tests and deploys `main` to GitHub Pages.
- `public/sw.js` is a minimal network-first service worker, registered in production only. Bump `CACHE` if caching behaviour changes.
