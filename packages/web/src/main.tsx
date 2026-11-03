import React, { lazy, Suspense, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider, Outlet, useLocation } from 'react-router-dom';
import './app.css';
import { useGame } from './store/useGame';
import { applySettingsToDocument, useSettings } from './store/useSettings';
import { useI18n } from './i18n';
import { Toasts } from './components/ui/Toasts';
import { ConsentBanner } from './components/ConsentBanner';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { startAnimator } from './lib/animator';

const Home = lazy(() => import('./pages/Home'));
const RoomPage = lazy(() => import('./pages/Room'));
const MapLanding = lazy(() => import('./pages/MapLanding'));
const Editor = lazy(() => import('./pages/Editor'));
const Store = lazy(() => import('./pages/Store'));
const Leaderboard = lazy(() => import('./pages/Leaderboard'));
const HowToPlay = lazy(() => import('./pages/HowToPlay'));

function Shell() {
  const init = useGame((s) => s.init);
  const lang = useI18n((s) => s.lang);
  const location = useLocation();
  useEffect(() => {
    init();
    startAnimator();
    applySettingsToDocument();
    document.documentElement.lang = lang;
  }, [init, lang]);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);
  const theme = useSettings((s) => s.theme);
  const dice = useSettings((s) => s.diceSkin);
  return (
    <div data-theme={theme} data-dice={dice} className="min-h-dvh">
      <a href="#main" className="sr-only-focusable btn btn-primary fixed top-2 left-2 z-50">
        Skip to content
      </a>
      <ErrorBoundary>
        <Suspense fallback={<div className="p-8 text-center opacity-60">…</div>}>
          <Outlet />
        </Suspense>
      </ErrorBoundary>
      <Toasts />
      <ConsentBanner />
    </div>
  );
}

const router = createBrowserRouter(
  [
    {
      element: <Shell />,
      children: [
        { path: '/', element: <Home /> },
        { path: '/room/:code', element: <RoomPage /> },
        { path: '/play/:mapId', element: <MapLanding /> },
        { path: '/editor', element: <Editor /> },
        { path: '/store', element: <Store /> },
        { path: '/store/success', element: <Store /> },
        { path: '/leaderboard', element: <Leaderboard /> },
        { path: '/how-to-play', element: <HowToPlay /> },
        { path: '*', element: <Home /> },
      ],
    },
  ],
  { basename: import.meta.env.BASE_URL.replace(/\/$/, '') || '/' },
);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
