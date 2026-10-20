import { Link, Navigate, isRouteErrorResponse, useParams, useRouteError } from 'react-router';
import { AgeGate } from '@/components/AgeGate';
import { ComingSoon, FullPageMessage } from '@/components/ComingSoon';
import { useMe } from '@/lib/queries';

/** One-time age gate right after the first sign-in; then on to the feed. */
export function OnboardingPage() {
  const me = useMe();
  if (!me.data) return null;
  if (!me.data.profile.age_confirmed_at) return <AgeGate />;
  return <Navigate to="/app/feed" replace />;
}

export function RoomPage() {
  const { id } = useParams();
  return (
    <ComingSoon title="Date room" phase={4}>
      Room <code>{id}</code>: pick coordinated looks together and lock in a date spot.
    </ComingSoon>
  );
}

export function NotFoundPage() {
  return (
    <FullPageMessage>
      <div className="grid gap-3 text-center">
        <p>Page not found.</p>
        <Link className="underline" to="/">
          Back home
        </Link>
      </div>
    </FullPageMessage>
  );
}

export function RouteErrorPage() {
  const error = useRouteError();
  return (
    <FullPageMessage>
      {isRouteErrorResponse(error)
        ? `${error.status} ${error.statusText}`
        : 'Something went wrong.'}
    </FullPageMessage>
  );
}
