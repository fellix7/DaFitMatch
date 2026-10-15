import { createBrowserRouter, Navigate, type RouteObject } from 'react-router';
import { AppLayout } from './AppLayout';
import { AuthCallbackPage } from './AuthCallbackPage';
import { RequireAdult, RequireAgeConfirmed, RequireAuth } from './guards';
import { LandingPage } from './LandingPage';
import { LoginPage } from './LoginPage';
import { FeedPage, NotFoundPage, OnboardingPage, RoomPage, RouteErrorPage } from './pages';
import { TryPage } from './TryPage';

/**
 * Guest-first flow: /  ->  /try (style builder, no account)  ->  "Generate fit" opens Google
 * sign-in  ->  /auth/callback saves the answers  ->  /app (age gate once, then the feed).
 */
export const routes: RouteObject[] = [
  {
    errorElement: <RouteErrorPage />,
    children: [
      { path: '/', element: <LandingPage /> },
      { path: '/try', element: <TryPage /> },
      { path: '/login', element: <LoginPage /> },
      { path: '/auth/callback', element: <AuthCallbackPage /> },
      {
        path: '/app',
        element: <RequireAuth />,
        children: [
          {
            element: <RequireAgeConfirmed />,
            children: [
              {
                element: <AppLayout />,
                children: [
                  { index: true, element: <Navigate to="feed" replace /> },
                  { path: 'onboarding', element: <OnboardingPage /> },
                  { path: 'feed', element: <FeedPage /> },
                  {
                    // Adults only: date rooms (and, later, photo upload / try-on routes).
                    element: <RequireAdult />,
                    children: [{ path: 'rooms/:id', element: <RoomPage /> }],
                  },
                ],
              },
            ],
          },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
