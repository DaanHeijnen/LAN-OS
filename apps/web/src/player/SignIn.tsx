// Signing in: "Sign in through Steam" for everyone, "Which one are you?" for a new Steam
// account, a PIN on another PC, and the admin password.
import { useEffect, useState, type ReactNode } from 'react';
import { api } from '../live.ts';
import { BrandMark } from '../ui/common.tsx';
import '../styles/app.css';
import '../styles/lan-os.css';

export interface AuthStatus { signedIn: boolean; playerId: string | null; isAdmin: boolean; demo: boolean; adminPasswordSet: boolean; hostPc: boolean }

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
  'invalid-link': "That sign-in link doesn't work anymore. Sign in with Steam instead.",
  'steam-unreachable': "Steam couldn't be reached. Check the internet connection and try again, or use your PIN.",
  'steam-failed': "Steam sign-in didn't finish. Please try again.",
  'wrong-steam': 'That link belongs to a different Steam account. Sign in to Steam with your own account.',
  'steam-taken': 'That Steam account is already linked to another player. Ask an admin to check the player list.',
};

function SignInFrame({ label, children }: { label: string; children: ReactNode }) {
  useEffect(() => {
    document.body.className = 'app-shell player-page';
    document.title = 'LAN OS · Sign in';
  }, []);
  return (
    <div className="sign-in">
      <a className="brand" href="/app"><BrandMark /><span>LAN <strong>OS</strong></span></a>
      <section className="card" style={{ marginTop: 24 }}>
        <div className="section-overline">{label}</div>
        {children}
      </section>
    </div>
  );
}

const SteamButton = ({ join }: { join?: string | null }) => (
  <a className="button button-primary steam-button" href={join ? `/auth/steam?join=${encodeURIComponent(join)}` : '/auth/steam'}>
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" /><circle cx="15.5" cy="9" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.8" /><circle cx="8.5" cy="15" r="1.8" fill="currentColor" /><path d="M8.5 15 13.6 10.6" stroke="currentColor" strokeWidth="1.8" /></svg>
    Sign in through Steam
  </a>
);

export function SignInPage() {
  const params = new URLSearchParams(location.search);
  const join = params.get('join');
  const claim = params.get('claim');
  if (claim) return <ClaimPage token={claim} />;
  return <SteamSignIn join={join} initialError={ERRORS[params.get('error') ?? ''] ?? null} />;
}

function SteamSignIn({ join, initialError }: { join: string | null; initialError: string | null }) {
  const [error, setError] = useState(initialError);
  const [pinPlayers, setPinPlayers] = useState<Array<{ id: string; nickname: string }>>([]);
  const [who, setWho] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  useEffect(() => { void api<typeof pinPlayers>('/api/auth/pin-players', 'GET').then(setPinPlayers).catch(() => {}); }, []);

  const submit = async () => {
    try {
      await api('/api/auth/pin', 'POST', join ? { join, pin } : { playerId: who, pin });
      location.replace('/app');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPin('');
    }
  };
  const pinForm = (
    <form onSubmit={e => { e.preventDefault(); void submit(); }}>
      <div className="modal-field">
        <label htmlFor="pin">Your 4-digit PIN</label>
        <input id="pin" className="pin-input" inputMode="numeric" autoFocus maxLength={4} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))} />
      </div>
      <button className="button button-primary" style={{ width: '100%' }} disabled={pin.length !== 4}>Sign in</button>
    </form>
  );

  return (
    <SignInFrame label="WELCOME TO THE LAN">
      <h1>{join ? 'Enter your PIN' : 'Sign in'}</h1>
      {!join && <>
        <p className="muted">Sign in with your Steam account. LAN OS only sees your public profile: your name, avatar and what you're playing.</p>
        <SteamButton />
        <p className="muted text-sm" style={{ marginTop: 14 }}>Your Steam profile and "Game details" must be set to Public, so the room can see what you play.</p>
      </>}
      {join && <>{pinForm}<p className="muted text-sm" style={{ marginTop: 18 }}>Forgot it? <a className="text-button" href={`/auth/steam?join=${encodeURIComponent(join)}`}>Sign in with Steam instead</a></p></>}
      {error && <p className="form-error">{error}</p>}
      {!join && pinPlayers.length > 0 && <div className="pin-section">
        <div className="section-overline" style={{ marginTop: 24 }}>NO STEAM ON THIS PC?</div>
        {!who ? <>
          <p className="muted text-sm">If you set a PIN on your dashboard, pick your name:</p>
          <div className="name-choices">{pinPlayers.map(p => <button key={p.id} className="button button-soft button-small" onClick={() => setWho(p.id)}>{p.nickname}</button>)}</div>
        </> : <>
          <p className="muted text-sm">Signing in as <b>{pinPlayers.find(p => p.id === who)?.nickname}</b>. <button className="text-button" onClick={() => setWho(null)}>Not you?</button></p>
          {pinForm}
        </>}
      </div>}
      <p className="muted text-sm" style={{ marginTop: 22 }}>Admin? <a className="text-button" href="/admin">Go to the admin page</a></p>
    </SignInFrame>
  );
}

function ClaimPage({ token }: { token: string }) {
  const [info, setInfo] = useState<{ steamName: string; unlinked: Array<{ id: string; nickname: string }> } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nickname, setNickname] = useState('');
  useEffect(() => {
    void api<NonNullable<typeof info>>(`/api/auth/claim/${token}`, 'GET')
      .then(i => { setInfo(i); setNickname(i.steamName.slice(0, 20)); }, e => setError(e instanceof Error ? e.message : String(e)));
  }, [token]);
  const claim = (body: object) => void api('/api/auth/claim', 'POST', { token, ...body })
    .then(() => location.replace('/app'), e => setError(e instanceof Error ? e.message : String(e)));

  return (
    <SignInFrame label="ONE MORE STEP">
      {!info ? <>
        <h1>Sign in</h1>
        {error && <p className="form-error">{error}</p>}
        <SteamButton />
      </> : <>
        <h1>Hi, {info.steamName}!</h1>
        {info.unlinked.length > 0 && <>
          <p className="muted">Which one are you? This links your Steam account to your name for the weekend.</p>
          <div className="name-choices">{info.unlinked.map(p => <button key={p.id} className="button button-soft" onClick={() => claim({ playerId: p.id })}>{p.nickname}</button>)}</div>
          <div className="section-overline" style={{ marginTop: 24 }}>NOT ON THE LIST?</div>
        </>}
        <form onSubmit={e => { e.preventDefault(); claim({ newNickname: nickname.trim() }); }}>
          <div className="modal-field">
            <label htmlFor="new-name">Join as a new player, with this name</label>
            <input id="new-name" maxLength={20} required value={nickname} onChange={e => setNickname(e.target.value)} />
          </div>
          <button className="button button-primary" style={{ width: '100%' }} disabled={!nickname.trim()}>Join the LAN</button>
        </form>
        {error && <p className="form-error">{error}</p>}
      </>}
    </SignInFrame>
  );
}

export function AdminSignIn({ passwordSet }: { passwordSet: boolean }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <SignInFrame label="ADMIN ACCESS">
      <h1>Control room</h1>
      <p className="muted">Admins get in automatically after signing in with Steam. On the host PC itself, the admin page always opens. Or use the admin password.</p>
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
      </form> : <p className="form-error">No admin password is set yet. Open the admin page on the host PC to finish setup.</p>}
      <p className="muted text-sm" style={{ marginTop: 18 }}><a className="text-button" href="/app/sign-in">Sign in with Steam instead</a></p>
    </SignInFrame>
  );
}
