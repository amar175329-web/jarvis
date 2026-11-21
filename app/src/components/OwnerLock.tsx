import { useState, type FormEvent } from 'react';
import { mapOwnerEnterError } from '../ownerLockPolicy';
import './OwnerLock.css';

export function OwnerLock({ onUnlocked }: { onUnlocked: () => void }) {
  const [keyInput, setKeyInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = keyInput.trim();
    if (!trimmed || submitting) return;

    setSubmitting(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/auth/owner.enter', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: trimmed }),
      });

      if (!res.ok) {
        setErrorMsg(mapOwnerEnterError(res.status));
        setKeyInput('');
        return;
      }

      const data = await res.json().catch(() => null);
      if (data?.ok) {
        setKeyInput('');
        setErrorMsg('');
        onUnlocked();
      } else {
        setErrorMsg(mapOwnerEnterError(401));
        setKeyInput('');
      }
    } catch {
      setErrorMsg(mapOwnerEnterError(0));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="owner-lock-shell" data-testid="owner-lock-screen">
      <section className="owner-lock-card" aria-label="JARVIS Owner Lock">
        <div className="owner-lock-header">
          <div className="owner-lock-badge" aria-hidden="true">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="11" width="16" height="10" rx="2" />
              <path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </svg>
          </div>
          <h1 className="owner-lock-title">JARVIS Locked</h1>
          <p className="owner-lock-sub">Aage badhne ke liye owner key daalo.</p>
        </div>

        <form className="owner-lock-form" onSubmit={handleSubmit}>
          <input
            id="owner-key-input"
            className="owner-lock-input"
            type="password"
            placeholder="Owner key daalo"
            aria-label="Owner key daalo"
            autoComplete="off"
            autoFocus
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            disabled={submitting}
          />
          <button
            id="owner-key-btn"
            className="owner-lock-btn"
            type="submit"
            disabled={submitting || !keyInput.trim()}
          >
            {submitting ? 'Check ho raha hai...' : 'Unlock'}
          </button>
        </form>

        {errorMsg ? (
          <p className="owner-lock-error" role="alert" id="owner-lock-error">
            {errorMsg}
          </p>
        ) : null}
      </section>
    </main>
  );
}
