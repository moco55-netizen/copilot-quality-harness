import { useEffect, useState } from 'react';

export default function App() {
  const [checks, setChecks] = useState([]);
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  async function loadChecks() {
    const response = await fetch('/api/checks');
    if (!response.ok) throw new Error('Unable to load quality checks');
    setChecks(await response.json());
  }

  useEffect(() => { loadChecks().catch((cause) => setError(cause.message)); }, []);

  async function addCheck(event) {
    event.preventDefault();
    setError('');
    const response = await fetch('/api/checks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name })
    });
    const payload = await response.json();
    if (!response.ok) { setError(payload.error); return; }
    setChecks((current) => [payload, ...current]);
    setName('');
  }

  return (
    <main className="app">
      <header>
        <p className="eyebrow">AI development quality harness</p>
        <h1>Quality checks</h1>
        <p>Track a small, deterministic checklist before a change reaches review.</p>
      </header>
      <form onSubmit={addCheck} aria-label="Add quality check">
        <label htmlFor="check-name">Check name</label>
        <div className="form-row">
          <input id="check-name" value={name} onChange={(event) => setName(event.target.value)} required maxLength="120" />
          <button type="submit">Add check</button>
        </div>
      </form>
      {error && <p role="alert" className="error">{error}</p>}
      <section aria-labelledby="checks-heading">
        <h2 id="checks-heading">Current checks</h2>
        {checks.length === 0 ? <p>No checks recorded yet.</p> : (
          <ul>{checks.map((check) => <li key={check.id}><span>{check.name}</span><small>{check.status}</small></li>)}</ul>
        )}
      </section>
    </main>
  );
}
