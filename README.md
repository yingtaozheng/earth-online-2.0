# 🌍 Earth Online 2.0

**Level up your real life, one week at a time.**

Earth Online is an RPG where the game world is your actual life. Your character has six attributes — Strength, Intelligence, Social, Vitality, Discipline and Creativity. Once a week you tell the **Game Master** (ChatGPT) what you did, and it updates your character by the rules: two gym sessions → +2 Strength; no exercise all week → −1 Strength. If you forget to mention something, the Game Master asks you a yes/no question instead of guessing.

It's an installable web app (PWA) that works on phone and desktop, keeps your data on your device, and runs offline. ChatGPT is needed only for the automatic scoring.

## Features

| Page | What it does |
|---|---|
| ⚔️ **Character** | Attribute cards, level & XP bar, class title (Warrior, Sage, Bard…), this week's changes, streak, recent activity |
| 🧙 **Check-in** | Paste your week → the Game Master scores it, asks follow-up yes/no questions, and spots completed tasks. You review and tweak everything before applying. You can also score the week yourself with a rule checklist. |
| 📜 **Quests** | Tasks (weekly or one-time, small bonus points) and achievements (big milestones and big rewards; automatic or unlocked by you) |
| 📈 **History** | Stat chart over time with a hover tooltip and table view, every weekly check-in (with undo), and a full adventure log |
| 📖 **Rules** | How the game works, plus the editable rule book the Game Master follows |
| ⚙️ **Settings** | Connect ChatGPT, character name, week start, weekly cap, theme, backup export/import |

The header shows a **real-time game clock**: live time, day count, and a countdown to the weekly reset.

## Quick start

Requires [Node.js](https://nodejs.org/) 20 or newer.

```bash
npm install
npm run dev        # http://localhost:5173
```

Other commands:

```bash
npm test           # unit tests (Vitest)
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build
npm run save       # commit everything and push (same script the auto-commit hook uses)
```

## Connecting ChatGPT

1. Create an API key at [platform.openai.com/api-keys](https://platform.openai.com/api-keys).
2. In the app, go to **Settings → ChatGPT Game Master**, paste the key and press **Connect**.
3. Optionally pick a model. The default is `gpt-5-mini`, and **Test connection** lists every model your key can use.

The key is stored only in your browser's local storage and is sent only to OpenAI. Backups never include it. API usage is billed by OpenAI separately from a ChatGPT Plus subscription; a weekly check-in costs a fraction of a cent.

> "Sign in with ChatGPT" (OAuth) is currently a partner-only beta at OpenAI, so personal apps can't use it yet. See [docs/IDEAS.md](docs/IDEAS.md) for the upgrade path.

## How scoring works

- **Weekly check-in:** the Game Master applies the rule book. Rules are either "each time" (+1 per gym session) or once per week (−1 for no exercise at all).
- **Follow-up questions:** a stat with no evidence gets a yes/no question (e.g. "Did you meet anyone in person this week?" Yes +1 / No −1).
- **Weekly cap:** each stat moves at most ±3 per check-in (configurable).
- **Tasks** give bonus points. **Achievements** give big rewards.
- **XP:** every point gained counts as XP. Losses lower stats but never XP, so your level never goes down.

The full, editable rules are on the in-app **Rules** page.

## Install as an app

- **Phone:** open the deployed site in Safari or Chrome → Share / menu → **Add to Home Screen**.
- **Desktop (Chrome/Edge):** click the install icon in the address bar.

## Deploying to GitHub Pages

`.github/workflows/deploy.yml` runs the tests and deploys `main` to GitHub Pages on every push.
One-time setup: **repo Settings → Pages → Source: GitHub Actions**. The app will then be at `https://<user>.github.io/<repo>/`.

## Your data

Everything (stats, history, rules, tasks) is saved in your browser's local storage on each device. Use **Settings → Export backup** to save a JSON file, and **Import backup** to restore it or move to another device. The text of your week is sent to OpenAI only when you press **Send to Game Master**.

## Project structure

```
src/
  types.ts              data model
  data/defaults.ts      stats, default rules, tasks, achievements
  lib/scoring.ts        stats, XP/levels, streaks, achievements, weekly history (pure functions)
  lib/openai.ts         Game Master prompt, API calls, response validation
  lib/week.ts           week ids, countdown formatting
  state/store.tsx       reducer + localStorage persistence
  pages/                one file per tab
  components/           game clock, stat chips, history chart
scripts/auto-commit.sh  commit + push helper (used by the Claude Code hook)
docs/IDEAS.md           proposed features to review
CLAUDE.md               guide for Claude Code working in this repo
```

## Development workflow

This repo is set up for [Claude Code](https://claude.com/claude-code). A **Stop hook** in `.claude/settings.json` runs `scripts/auto-commit.sh` after each Claude turn: it commits every change and tries to push to `origin`. If a push fails (for example, missing SSH key), the commit stays local and Claude Code shows a message. Run `git push` to see the error.
To turn auto-commit off, remove the hook from `.claude/settings.json` (or open `/hooks` in Claude Code).
