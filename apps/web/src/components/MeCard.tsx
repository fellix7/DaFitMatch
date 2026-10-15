import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useMe } from '@/lib/queries';
import { COMFORT_LABELS } from '@/lib/styleOptions';

/** The caller's saved style profile from GET /me (browser auth -> API JWT check -> RLS). */
export function MeCard() {
  const me = useMe();
  const taste = me.data?.taste_profile;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your style profile</CardTitle>
        <CardDescription>Saved to your account.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 text-sm">
        {me.isPending && <p className="text-muted-foreground">Loading…</p>}
        {me.isError && <p className="text-destructive">Could not load your profile.</p>}
        {me.data && (
          <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
            <dt className="text-muted-foreground">Name</dt>
            <dd>{me.data.profile.display_name ?? '—'}</dd>
            <dt className="text-muted-foreground">Budget</dt>
            <dd>
              {me.data.profile.default_budget_inr
                ? `₹${me.data.profile.default_budget_inr.toLocaleString('en-IN')}`
                : '—'}
            </dd>
            <dt className="text-muted-foreground">Styles</dt>
            <dd>{taste ? Object.keys(taste.archetype_weights).join(', ') || '—' : '—'}</dd>
            <dt className="text-muted-foreground">Loves</dt>
            <dd className="capitalize">{taste?.colors_like.join(', ') || '—'}</dd>
            <dt className="text-muted-foreground">Avoids</dt>
            <dd className="capitalize">{taste?.colors_avoid.join(', ') || '—'}</dd>
            <dt className="text-muted-foreground">Vibe</dt>
            <dd>{taste ? COMFORT_LABELS[taste.comfort_vs_statement] : '—'}</dd>
          </dl>
        )}
        <div>
          <Button asChild variant="outline" size="sm">
            <Link to="/try">Edit my style</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
