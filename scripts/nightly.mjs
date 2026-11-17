// Nightly check: everything that should stay true about the project, in one run.
//
//   npm run nightly            run all steps, print a summary, exit 1 if any failed
//   npm run nightly -- --fast  skip the browser smoke test
//
// .github/workflows/nightly.yml runs this every night; it also works locally.
// Every step runs even if an earlier one failed, so one report shows all problems.

import { execSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const fast = process.argv.includes('--fast');
const results = [];

function run(name, command, { optional = false } = {}) {
  console.log(`\n━━ ${name} ━━  ${command}`);
  const started = Date.now();
  const { status } = spawnSync(command, { shell: true, stdio: 'inherit' });
  results.push({ name, ok: status === 0, optional, seconds: ((Date.now() - started) / 1000).toFixed(1) });
}

/** The repo is public: fail if anything that looks like an API key is tracked. */
function scanForSecrets() {
  console.log('\n━━ No secrets in tracked files ━━');
  const started = Date.now();
  const patterns = [/sk-[A-Za-z0-9_-]{20,}/, /ghp_[A-Za-z0-9]{30,}/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/];
  const files = execSync('git ls-files', { encoding: 'utf8' }).split('\n').filter(Boolean);
  const hits = [];
  for (const file of files) {
    if (/\.(png|jpe?g|ico|woff2?|svg)$/i.test(file) || file === 'package-lock.json') continue;
    let text;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    text.split('\n').forEach((line, i) => {
      if (patterns.some((p) => p.test(line))) hits.push(`${file}:${i + 1}`);
    });
  }
  for (const hit of hits) console.log(`  possible secret at ${hit}`);
  if (!hits.length) console.log(`  ${files.length} tracked files are clean.`);
  results.push({ name: 'No secrets in tracked files', ok: hits.length === 0, optional: false, seconds: ((Date.now() - started) / 1000).toFixed(1) });
}

run('Type check', 'npm run typecheck');
run('Unit tests', 'npm test');
run('Production build', 'npm run build');
if (!fast) run('Browser smoke test', 'npm run smoke');
scanForSecrets();
// Known vulnerabilities in what ships to players. Dev-only tooling is reported but does not fail the night.
run('Dependency audit (runtime)', 'npm audit --omit=dev --audit-level=high');
run('Dependency audit (all, informational)', 'npm audit --audit-level=high', { optional: true });

console.log('\n━━ Nightly summary ━━');
for (const r of results) {
  const mark = r.ok ? '✓' : r.optional ? '!' : '✗';
  console.log(`  ${mark} ${r.name} (${r.seconds}s)${!r.ok && r.optional ? '  — informational' : ''}`);
}
const failed = results.filter((r) => !r.ok && !r.optional);
if (failed.length) {
  console.log(`\n${failed.length} step(s) failed: ${failed.map((r) => r.name).join(', ')}`);
  process.exit(1);
}
console.log('\nAll good.');
