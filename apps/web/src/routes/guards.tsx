import { Navigate, Outlet, useLocation } from 'react-router';
import { FullPageMessage } from '@/components/ComingSoon';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useMe } from '@/lib/queries';
import { useSession } from '@/lib/session';

/** /app/* requires a Supabase session; otherwise go to /login and come back afterwards. */
export function RequireAuth() {
  const { ready, session } = useSession();
  const location = useLocation();

  if (!ready) return <FullPageMessage>Loading…</FullPageMessage>;
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

/** Everyone completes the one-time age gate (on /app/onboarding) before using the app. */
export function RequireAgeConfirmed() {
  const me = useMe();
  const location = useLocation();

  if (me.isPending) return <FullPageMessage>Loading your profile…</FullPageMessage>;
  if (me.isError)
    return <FullPageMessage>Could not load your profile. Please refresh.</FullPageMessage>;
  if (!me.data.profile.age_confirmed_at && location.pathname !== '/app/onboarding') {
    return <Navigate to="/app/onboarding" replace />;
  }
  return <Outlet />;
}

/**
 * Adults-only areas: photo upload, try-on and date rooms. The database enforces the same rule
 * (RLS + RPC checks); this guard is the UX layer only.
 */
export function RequireAdult() {
  const me = useMe();

  if (me.isPending) return <FullPageMessage>Loading…</FullPageMessage>;
  if (me.isError || !me.data.profile.is_adult) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Adults only</CardTitle>
          <CardDescription>
            Date rooms and photo features are available to users aged 18+.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }
  return <Outlet />;
}
