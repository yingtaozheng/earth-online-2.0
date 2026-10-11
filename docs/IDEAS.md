# Ideas & additions to review

Tick the boxes (`[x]`) for what you want and add notes. Then ask Claude to "apply my choices in docs/IDEAS.md".

- **Part A** lists things I **already built** that go beyond your original request. They're easy to remove or change if you don't want them.
- **Part B** lists **proposals I did not build**, ranked by how much I think they'd help.
- **Part C** lists **decisions I made for you** that you may want to change.

---

## Part A: Already built beyond your request

| Keep? | Addition | Why |
|---|---|---|
| [ ] | **3 extra stats**: Vitality (sleep, food, health), Discipline (habits, follow-through), Creativity (making things), alongside Strength, Intelligence and Social | Covers the main areas of a week. Each has its own +1/−1 rules. |
| [ ] | **Weekly cap of ±3 per stat** (adjustable in Settings) | Stops one extreme week, or a model mistake, from swinging a stat by 10. |
| [ ] | **Review before applying**: you can adjust every change the Game Master proposes with −/+ before it hits your character | The AI will sometimes miscount, and you stay in control. |
| [ ] | **"Score it myself" mode**, a rule checklist with counters | Lets you check in when there's no API key, the internet is down, or you'd rather not send your week to OpenAI. |
| [ ] | **Check in for "last week"** | Most people do the weekly review on Monday morning. |
| [ ] | **Redo / undo a check-in** | Redoing a week replaces its result, and History has an undo button. |
| [ ] | **Game Master auto-detects completed tasks** from your schedule (pre-ticked, you confirm) | Saves ticking them twice. |
| [ ] | **XP and levels** (every point gained = XP; losses never reduce your level) plus a **class title** from your top stat (Warrior, Sage, Bard, Monk, Paladin, Artisan) | Gives a sense of progress even in a bad week. |
| [ ] | **Automatic achievements**: first check-in, 4- and 12-week streaks, 10 tasks, stat reaches 20, level 5. Also **manual ones** you unlock yourself (half marathon, 12 books) and a form to create your own | Your "big boost" milestones, with no bookkeeping needed. |
| [ ] | **Check-in streak** on the Character page | Streaks are the strongest habit hook in games. |
| [ ] | **Manual "Adjust…" on each stat**, with a reason, logged in History | For things outside the rules (e.g. "ran my first 10K, +2 STR"). |
| [ ] | **Editable rule book**: the Game Master reads your rules word for word, so editing a rule changes how it scores | Lets you tune the game as your goals change. |
| [ ] | **Backup export / import** (JSON; your API key is never included) | Your data lives in the browser, so this is the safety net. |
| [ ] | **Installable app + offline** (PWA), dark/light theme, Monday or Sunday week start | Works like a native app on phone and desktop. |
| [ ] | **GitHub Pages deploy + CI**: every push to `main` runs the tests and publishes the app | Gives you a URL to open on your phone. |

## Part B: Proposals (not built yet)

### High value

- [ ] **B1. Cloud sync between phone and laptop.** Right now each device has its own save. Options:
  - (a) Auto-save your game data as a JSON file to a **private GitHub repo** through the GitHub API, which also gives a full version history of your life stats. This is the closest match to "GitHub with auto commit" applied to your *data*.
  - (b) A small backend (Supabase or Firebase) with real login. This also enables B2.
- [ ] **B2. Real "Sign in with ChatGPT".** OpenAI started a *Sign in with ChatGPT* beta in July 2026, but only for launch partners (Notion, Vercel, GitLab…). When it opens to all developers, the API-key step can become a "Sign in with ChatGPT" button, possibly billed to your ChatGPT plan. Until then the API key is the only option for a personal app. A middle ground is your own backend holding the key behind your own login (needs B1b).
- [ ] **B3. Weekly reminder** on Sunday evening ("Your weekly reset is in 3 hours, check in with the Game Master"). Easiest: download a recurring calendar event (.ics) from Settings. True push notifications need a server.
- [ ] **B4. Calendar import**: upload an `.ics` export or connect Google Calendar, so you don't have to paste your schedule.
- [ ] **B5. Chat with the Game Master** after scoring: "Why did I lose Social?", "Actually I went to the gym 3 times." It re-scores in the conversation.
- [ ] **B6. Next-week quests from the Game Master**: after each check-in, it suggests 2–3 tasks targeting your weakest stats, which you can accept with one tap.

### Medium value

- [ ] **B7. Vacation / sick-week mode**: freezes losses for a week so being ill doesn't feel like a punishment.
- [ ] **B8. Streak freeze tokens** earned from achievements, so one missed check-in doesn't break a long streak.
- [ ] **B9. Mood & energy rating (1–5)** plus a one-line reflection each week. Not scored, but charted next to stats so you can spot patterns.
- [ ] **B10. Radar chart** of the six stats on the Character page, and a **monthly / year-in-review** report written by the Game Master.
- [ ] **B11. Diminishing returns at high levels** (e.g. above 30, gains need two occurrences). Keeps late-game progress meaningful.
- [ ] **B12. Custom stats**: add, rename or remove attributes (e.g. "Finance", "Spirit"). The current six are fixed in code.

### Nice to have

- [ ] **B13. Level-up animation and sound**, plus an avatar that changes with level and class.
- [ ] **B14. Privacy filter**: replace friends' names with initials before sending your week to OpenAI.
- [ ] **B15. Native app wrapper** (Capacitor for iOS/Android, Tauri for desktop) if you want app-store-style installs. The PWA already installs fine without it.
- [ ] **B16. Optional daily mini check-in** (30 seconds) feeding the weekly one, for more accurate scoring.

## Part C: Decisions to confirm

| Decision | Current choice | Change to |
|---|---|---|
| App platform | Web app (PWA), installable on phone and desktop | |
| AI provider and model | OpenAI, `gpt-5-mini` default (changeable in Settings) | |
| Starting value of each stat | 10 | |
| Weekly cap per stat | ±3 | |
| Week starts on | Monday | |
| Max follow-up questions per week | 4 | |
| Level curve | Lv2 at 5 XP, Lv3 at 15, Lv5 at 50, Lv10 at 225 (about 5–8 XP per active week) | |
| Undoing a check-in that unlocked an achievement | The achievement stays unlocked | |
| Auto-commit | After **every** Claude Code turn, commit all changes and push to `origin` | e.g. commit only, or only when you run `npm run save` |
| Stat display | Starts at 10, no maximum (bars rescale) | e.g. 0–100 scale |
