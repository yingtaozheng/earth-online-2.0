#!/usr/bin/env bash
# Commit every change in the repo, then try to push to GitHub.
#
# Runs automatically at the end of every Claude Code turn (Stop hook in
# .claude/settings.json) and manually via `npm run save`.
# It never fails loudly: a hook must not block the session, so problems are
# reported as a message instead of an error exit.

set -u
cd "$(dirname "$0")/.." || exit 0
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

say() {
  # Stop hooks show `systemMessage` to the user; plain stdout is fine for `npm run save`.
  if [ -n "${CLAUDE_PROJECT_DIR:-}" ]; then
    printf '{"systemMessage": "%s"}\n' "$1"
  else
    echo "$1"
  fi
}

git add -A 2>/dev/null
if git diff --cached --quiet; then
  exit 0
fi

count=$(git diff --cached --name-only | wc -l | tr -d ' ')
files=$(git diff --cached --name-only | head -3 | xargs -n1 basename | paste -sd ',' - | sed 's/,/, /g')
[ "$count" -gt 3 ] && files="$files, …"
subject="auto: update $count file(s) — $files"

if [ -n "${CLAUDE_PROJECT_DIR:-}" ]; then
  git commit -q -m "$subject" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" || { say "Auto-commit failed."; exit 0; }
else
  git commit -q -m "$subject" || { say "Auto-commit failed."; exit 0; }
fi

if ! git remote get-url origin >/dev/null 2>&1; then
  say "Auto-committed $count file(s). No 'origin' remote, so nothing was pushed."
  exit 0
fi

# BatchMode stops SSH from waiting for a password prompt nobody can answer.
if GIT_SSH_COMMAND="${GIT_SSH_COMMAND:-ssh -o BatchMode=yes -o ConnectTimeout=10}" \
  timeout 60 git push -q -u origin HEAD >/dev/null 2>&1; then
  say "Auto-committed $count file(s) and pushed to GitHub."
else
  say "Auto-committed $count file(s). Push to GitHub failed — run 'git push' to see why."
fi
exit 0
