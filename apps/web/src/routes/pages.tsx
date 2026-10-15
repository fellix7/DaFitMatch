import { Link, isRouteErrorResponse, useParams, useRouteError } from 'react-router';
import { AgeGate } from '@/components/AgeGate';
import { ComingSoon, FullPageMessage } from '@/components/ComingSoon';
import { MeCard } from '@/components/MeCard';
import { Button } from '@/components/ui/button';
import { useMe } from '@/lib/queries';

export function HomePage() {
  return (
    <div className="mx-auto grid min-h-dvh max-w-xl place-content-center gap-6 px-4 text-center">
      <h1 className="text-4xl font-semibold tracking-tight">DaFitMatch</h1>
      <p className="text-muted-foreground">
        Date outfits for both of you, built from real pieces you can buy (or already own), plus a
        spot in Delhi NCR that matches the vibe.
      </p>
      <div>
        <Button asChild size="lg">
          <Link to="/login">Get started</Link>
        </Button>
      </div>
    </div>
  );
}

export function OnboardingPage() {
  const me = useMe();
  if (!me.data) return null;
  if (!me.data.profile.age_confirmed_at) return <AgeGate />;
  return (
    <>
      <ComingSoon title="Your style quiz" phase={2}>
        A quick swipe quiz that builds your taste profile.
      </ComingSoon>
      <Button asChild variant="outline">
        <Link to="/app/feed">Go to your feed</Link>
      </Button>
    </>
  );
}

export function FeedPage() {
  return (
    <>
      <ComingSoon title="Your outfit feed" phase={3}>
        Outfits composed from real products and your own wardrobe, scored to your taste.
      </ComingSoon>
      <MeCard />
    </>
  );
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
