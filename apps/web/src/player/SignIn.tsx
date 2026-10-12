// Signing in: personal join links lead here when a PIN is set or something went wrong.
import { useEffect, useState } from 'react';
import { api } from '../live.ts';
import { BrandMark } from '../ui/common.tsx';
import '../styles/app.css';
import '../styles/lan-os.css';

export interface AuthStatus { signedIn: boolean; playerId: string | null; isAdmin: boolean; demo: boolean; adminPasswordSet: boolean }

/** Checks the session; a player page without one goes to the sign-in page. */
export function useSignedIn(kind: 'player' | 'admin'): AuthStatus | null {
  const [status, setStatus] = useState<AuthStatus | null>(null);
  useEffect(() => {
    void api<AuthStatus>('/api/auth/status', 'GET').then(s => {
      if (kind === 'player' && !s.playerId) location.replace('/app/sign-in');
      else setStatus(s);
    }).catch(() => window.setTimeout(() => location.reload(), 3000));
  }, [kind]);
  return status;
}

const ERRORS: Record<string, string> = {
  'invalid-link': "This join link doesn't work anymore. Ask an admin for a new one.",
  'steam-unreachable': "Steam couldn't be reached. Check the internet connection and try again, or use your PIN.",
  'steam-failed': "Steam sign-in didn't finish. Please try again.",
  'wrong-steam': 'This join link belongs to a different Steam account. Sign in to Steam with your own account, or ask an admin.',
  'steam-taken': 'That Steam account is already linked to another player. Ask an admin to check players.yaml.',
};

export function SignInPage() {
  const params = new URLSearchParams(location.search);
  const join = params.get('join');
  const [error, setError] = useState(ERRORS[params.get('error') ?? ''] ?? null);
  const [pin, setPin] = useState('');

  useEffect(() => {
    document.body.className = 'app-shell player-page';
    document.title = 'LAN OS · Sign in';
  }, []);

  const submit = async () => {
    try {
      await api('/api/auth/pin', 'POST', { join, pin });
      location.replace('/app');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPin('');
    }
  };

  return (
    <div className="sign-in">
      <a className="brand" href="/app"><BrandMark /><span>LAN <strong>OS</strong></span></a>
      <section className="card" style={{ marginTop: 24 }}>
        <div className="section-overline">WELCOME</div>
        {join ? <>
          <h1>Enter your PIN</h1>
          <p className="muted">You set a 4-digit PIN for new browsers.</p>
          <form onSubmit={e => { e.preventDefault(); void submit(); }}>
            <div className="modal-field">
              <label htmlFor="pin" className="sr-only">PIN</label>
              <input id="pin" className="pin-input" inputMode="numeric" autoFocus maxLength={4} value={pin}
                onChange={e => setPin(e.target.value.replace(/\D/g, ''))} />
            </div>
            <button className="button button-primary" style={{ width: '100%' }} disabled={pin.length !== 4}>Sign in</button>
          </form>
          {error && <p className="form-error">{error}</p>}
          <p className="muted text-sm" style={{ marginTop: 18 }}>
            Forgot it? <a className="text-button" href={`/auth/steam?join=${encodeURIComponent(join)}`}>Sign in with Steam instead</a>
          </p>
        </> : <>
          <h1>Open your join link</h1>
          {error && <p className="form-error">{error}</p>}
          <p className="muted">Every player has a personal join link. Open it on this PC to sign in with Steam. Ask an admin if you don't have yours.</p>
          <p className="muted text-sm">Admin? <a className="text-button" href="/admin">Go to the admin page</a></p>
        </>}
      </section>
    </div>
  );
}

export function AdminSignIn({ passwordSet }: { passwordSet: boolean }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="sign-in">
      <a className="brand" href="/app"><BrandMark /><span>LAN <strong>OS</strong></span></a>
      <section className="card" style={{ marginTop: 24 }}>
        <div className="section-overline">ADMIN ACCESS</div>
        <h1>Control room</h1>
        <p className="muted">Admins from players.yaml get in automatically after signing in with their join link. Or use the admin password from the .env file.</p>
        {passwordSet ? <form onSubmit={e => {
          e.preventDefault();
          void api('/api/auth/admin', 'POST', { password }).then(() => location.reload(), err => setError(err instanceof Error ? err.message : String(err)));
        }}>
          <div className="modal-field">
            <label htmlFor="admin-password">Admin password</label>
            <input id="admin-password" type="password" autoFocus value={password} onChange={e => setPassword(e.target.value)} />
          </div>
          <button className="button button-primary" style={{ width: '100%' }} disabled={!password}>Open the control room</button>
          {error && <p className="form-error">{error}</p>}
        </form> : <p className="form-error">No admin password is set yet. Add ADMIN_PASSWORD to the .env file (see .env.example) and restart LAN OS.</p>}
      </section>
    </div>
  );
}
