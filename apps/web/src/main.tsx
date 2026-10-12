// One build, three screens: /wall, /app (player) and /admin. Each loads only its own styles.
import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { ToastProvider } from './ui/common.tsx';

const Wall = lazy(() => import('./wall/Wall.tsx'));
const Player = lazy(() => import('./player/Player.tsx'));
const SignIn = lazy(() => import('./player/SignIn.tsx').then(m => ({ default: m.SignInPage })));
const Admin = lazy(() => import('./admin/Admin.tsx'));

function Screen() {
  const path = location.pathname.replace(/\/+$/, '');
  if (path === '/wall') return <Wall />;
  if (path === '/admin') return <Admin />;
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
