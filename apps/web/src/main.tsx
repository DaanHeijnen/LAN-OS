// One build: /wall, /app (player), /admin, /setup and /recap. Each loads only its own styles.
import { lazy, StrictMode, Suspense, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ToastProvider } from './ui/common.tsx';

const Wall = lazy(() => import('./wall/Wall.tsx'));
const Player = lazy(() => import('./player/Player.tsx'));
const SignIn = lazy(() => import('./player/SignIn.tsx').then(m => ({ default: m.SignInPage })));
const Admin = lazy(() => import('./admin/Admin.tsx'));
const Recap = lazy(() => import('./recap/Recap.tsx'));

/** The player dashboard, the admin page and its settings, between which admins switch without reloading. */
const SWITCHABLE = /^\/(app|admin|admin\/settings)\/?$/;

/** Follows links between /app, /admin and /admin/settings inside the page; the browser's back button works too. */
function usePath(): string {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const onPop = () => setPath(location.pathname);
    const onClick = (e: MouseEvent) => {
      const link = (e.target as Element | null)?.closest?.('a');
      if (!link || link.target || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const url = new URL(link.href);
      if (url.origin !== location.origin || !SWITCHABLE.test(url.pathname) || !SWITCHABLE.test(location.pathname)) return;
      // A jump link (#section) on this same screen works as usual.
      if (url.pathname === location.pathname && url.hash) return;
      e.preventDefault();
      if (url.pathname === location.pathname) return;
      history.pushState(null, '', url.pathname + url.hash);
      setPath(url.pathname);
      // After the new screen has drawn, go to the #section it links to, or to the top.
      window.setTimeout(() => {
        const target = url.hash ? document.getElementById(url.hash.slice(1)) : null;
        if (target) target.scrollIntoView();
        else window.scrollTo(0, 0);
      }, 50);
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
  if (path === '/admin' || path.startsWith('/admin/')) return <Admin path={path} />;
  // The old setup address now opens Settings inside the admin page.
  if (path === '/setup') {
    history.replaceState(null, '', `/admin/settings${location.search}${location.hash}`);
    return <Admin path="/admin/settings" />;
  }
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
