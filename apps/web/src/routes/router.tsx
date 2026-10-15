import { createBrowserRouter, Navigate, type RouteObject } from 'react-router';
import { AppLayout } from './AppLayout';
import { RequireAdult, RequireAgeConfirmed, RequireAuth } from './guards';
import { LoginPage } from './LoginPage';
import {
  FeedPage,
  HomePage,
  NotFoundPage,
  OnboardingPage,
  RoomPage,
  RouteErrorPage,
} from './pages';

export const routes: RouteObject[] = [
  {
    errorElement: <RouteErrorPage />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/login', element: <LoginPage /> },
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
