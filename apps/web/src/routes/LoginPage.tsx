import { Link, Navigate, useLocation } from 'react-router';
import { GoogleSignInButton } from '@/components/SignInDialog';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { safeNext } from '@/lib/auth';
import { useSession } from '@/lib/session';

/** Direct sign-in (e.g. returning users or deep links into /app). New users start at /try. */
export function LoginPage() {
  const session = useSession((s) => s.session);
  const location = useLocation();
  const next = safeNext((location.state as { from?: string } | null)?.from);

  if (session) return <Navigate to={next} replace />;

  return (
    <div className="mx-auto grid min-h-dvh max-w-sm place-content-center gap-4 px-4">
      <Card>
        <CardHeader>
          <CardTitle>Welcome back</CardTitle>
          <CardDescription>Sign in to see your outfits, wardrobe and date rooms.</CardDescription>
        </CardHeader>
        <CardContent>
          <GoogleSignInButton next={next} />
        </CardContent>
      </Card>
      <p className="text-center text-sm text-muted-foreground">
        New here?{' '}
        <Link className="underline" to="/try">
          Build your fit first
        </Link>
      </p>
    </div>
  );
}
