import { useRef, useState } from 'react';
import { DEFAULT_MODEL } from '../data/defaults';
import { OpenAIError, listModels } from '../lib/openai';
import { normalizeState, useGame } from '../state/store';
import type { Settings } from '../types';

export function SettingsPage() {
  const { state, dispatch } = useGame();
  const s = state.settings;
  const update = (patch: Partial<Settings>) => dispatch({ type: 'updateSettings', patch });

  return (
    <div className="stack" style={{ gap: 20 }}>
      <section className="card stack">
        <h2>Character</h2>
        <label>
          Name
          <input value={s.characterName} onChange={(e) => update({ characterName: e.target.value })} />
        </label>
        <span className="small muted">Adventure started {new Date(s.startedAt).toLocaleDateString()}.</span>
      </section>

      <ChatGptSection />

      <section className="card stack">
        <h2>Game</h2>
        <div className="field-row">
          <label>
            Week starts on
            <select value={s.weekStartsOn} onChange={(e) => update({ weekStartsOn: Number(e.target.value) as 0 | 1 })}>
              <option value={1}>Monday</option>
              <option value={0}>Sunday</option>
            </select>
          </label>
          <label>
            Max change per stat per week
            <input
              type="number"
              min={1}
              max={10}
              value={s.weeklyCapPerStat}
              onChange={(e) => update({ weeklyCapPerStat: Math.max(1, Math.min(10, Number(e.target.value) || 1)) })}
            />
          </label>
          <label>
            Theme
            <select value={s.theme} onChange={(e) => update({ theme: e.target.value as Settings['theme'] })}>
              <option value="auto">Match device</option>
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </select>
          </label>
        </div>
        <span className="small muted">Changing the week start only affects new weeks; past check-ins keep their dates.</span>
      </section>

      <DataSection />

      <p className="small muted">
        Your data is saved in this browser only. Export a backup regularly — or see docs/IDEAS.md for cloud sync options.
      </p>
    </div>
  );
}

function ChatGptSection() {
  const { state, dispatch } = useGame();
  const s = state.settings;
  const [keyInput, setKeyInput] = useState('');
  const [status, setStatus] = useState<{ kind: 'idle' | 'busy' | 'ok' | 'error'; message?: string }>({ kind: 'idle' });
  const [models, setModels] = useState<string[]>([]);

  async function connect(key: string) {
    setStatus({ kind: 'busy' });
    try {
      const found = await listModels(key);
      setModels(found);
      dispatch({ type: 'updateSettings', patch: { openaiApiKey: key } });
      setKeyInput('');
      setStatus({ kind: 'ok', message: `Connected. ${found.length} chat models available.` });
    } catch (e) {
      setStatus({ kind: 'error', message: e instanceof OpenAIError ? e.message : String(e) });
    }
  }

  const connected = Boolean(s.openaiApiKey);

  return (
    <section className="card stack">
      <div className="spread">
        <h2 style={{ margin: 0 }}>🧙 ChatGPT Game Master</h2>
        <span className={`chip ${connected ? 'good' : ''}`}>{connected ? '● Connected' : '○ Not connected'}</span>
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        Sign in by pasting an OpenAI API key from{' '}
        <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer">
          platform.openai.com/api-keys
        </a>
        . The key is stored only on this device and sent only to OpenAI. Your weekly text is sent to OpenAI when you ask
        the Game Master. API usage is billed by OpenAI separately from a ChatGPT Plus subscription — a weekly check-in
        typically costs well under a cent.
      </p>

      {connected ? (
        <div className="row">
          <span className="mono small">sk-…{s.openaiApiKey.slice(-4)}</span>
          <button className="btn small" disabled={status.kind === 'busy'} onClick={() => connect(s.openaiApiKey)}>
            {status.kind === 'busy' ? 'Testing…' : 'Test connection'}
          </button>
          <button
            className="btn small danger"
            onClick={() => {
              dispatch({ type: 'updateSettings', patch: { openaiApiKey: '' } });
              setStatus({ kind: 'idle' });
            }}
          >
            Sign out
          </button>
        </div>
      ) : (
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            if (keyInput.trim()) connect(keyInput.trim());
          }}
        >
          <input
            type="password"
            autoComplete="off"
            placeholder="sk-…"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            style={{ flex: 1, minWidth: 200 }}
            aria-label="OpenAI API key"
          />
          <button className="btn primary" type="submit" disabled={!keyInput.trim() || status.kind === 'busy'}>
            {status.kind === 'busy' ? 'Connecting…' : 'Connect'}
          </button>
        </form>
      )}
      {status.message && <div className={`notice small ${status.kind === 'error' ? 'error' : ''}`}>{status.message}</div>}

      <label>
        Model
        <input
          list="model-options"
          value={s.model}
          onChange={(e) => dispatch({ type: 'updateSettings', patch: { model: e.target.value.trim() || DEFAULT_MODEL } })}
        />
        <datalist id="model-options">
          {models.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
        <span className="small muted">
          Default {DEFAULT_MODEL}. Use "Test connection" to list the models your key can use.
        </span>
      </label>
    </section>
  );
}

function DataSection() {
  const { state, dispatch } = useGame();
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState('');

  function exportData() {
    // The API key is deliberately left out so backups are safe to store or share.
    const data = { ...state, settings: { ...state.settings, openaiApiKey: '' } };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `earth-online-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function importData(file: File) {
    try {
      const parsed = JSON.parse(await file.text());
      if (!confirm('Replace all current data with this backup?')) return;
      const next = normalizeState(parsed);
      next.settings.openaiApiKey = state.settings.openaiApiKey;
      dispatch({ type: 'replaceState', state: next });
      setMessage(`Imported ${next.checkins.length} check-ins and ${next.ledger.length} events.`);
    } catch {
      setMessage('That file is not a valid Earth Online backup.');
    }
  }

  return (
    <section className="card stack">
      <h2>Data</h2>
      <div className="row">
        <button className="btn" onClick={exportData}>
          Export backup
        </button>
        <button className="btn" onClick={() => fileRef.current?.click()}>
          Import backup
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) importData(f);
            e.target.value = '';
          }}
        />
        <button
          className="btn danger"
          onClick={() =>
            confirm('Start a brand-new character? All stats, history, tasks and custom rules on this device will be erased.') &&
            dispatch({ type: 'resetAll' })
          }
        >
          New game
        </button>
      </div>
      {message && <div className="notice small">{message}</div>}
    </section>
  );
}
