// One build: /wall, /app (player), /admin, /setup and /recap. Each loads only its own styles.
import { lazy, StrictMode, Suspense, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ToastProvider } from './ui/common.tsx';

const Wall = lazy(() => import('./wall/Wall.tsx'));
const Player = lazy(() => import('./player/Player.tsx'));
const SignIn = lazy(() => import('./player/SignIn.tsx').then(m => ({ default: m.SignInPage })));
const Admin = lazy(() => import('./admin/Admin.tsx'));
const Setup = lazy(() => import('./admin/Setup.tsx'));
const Recap = lazy(() => import('./recap/Recap.tsx'));

/** The player dashboard and the admin page, between which admins switch without reloading. */
const SWITCHABLE = /^\/(app|admin)\/?$/;

/** Follows links between /app and /admin inside the page; the browser's back button works too. */
function usePath(): string {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const onPop = () => setPath(location.pathname);
    const onClick = (e: MouseEvent) => {
      const link = (e.target as Element | null)?.closest?.('a');
      if (!link || link.target || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const url = new URL(link.href);
      // Jump links (#section) and links elsewhere work as usual.
      if (url.hash || url.origin !== location.origin || !SWITCHABLE.test(url.pathname) || !SWITCHABLE.test(location.pathname)) return;
      e.preventDefault();
      if (url.pathname === location.pathname) return;
      history.pushState(null, '', url.pathname);
      setPath(url.pathname);
      window.scrollTo(0, 0);
    };
    window.addEventListener('popstate', onPop);
    document.addEventListener('click', onClick);
    return () => {
      window.removeEventListener('popstate', onPop);
      document.removeEventListener('click', onClick);
    };
  }, []);
  return path;
}

function Screen() {
  const path = usePath().replace(/\/+$/, '');
  if (path === '/wall') return <Wall />;
  if (path === '/admin' || path.startsWith('/admin/')) return <Admin />;
  if (path === '/setup') return <Setup />;
  if (path === '/recap' || path.startsWith('/recap/')) return <Recap />;
  if (path === '/app/sign-in') return <SignIn />;
  return <Player />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <Suspense fallback={null}><Screen /></Suspense>
    </ToastProvider>
  </StrictMode>,
);
