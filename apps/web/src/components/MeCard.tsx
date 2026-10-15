import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useMe } from '@/lib/queries';

/** Shows the caller's own data from GET /me: proves browser auth -> API JWT check -> RLS. */
export function MeCard() {
  const me = useMe();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your profile</CardTitle>
        <CardDescription>Loaded from GET /me with your own session.</CardDescription>
      </CardHeader>
      <CardContent className="text-sm">
        {me.isPending && <p className="text-muted-foreground">Loading…</p>}
        {me.isError && <p className="text-destructive">Could not load your profile.</p>}
        {me.data && (
          <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
            <dt className="text-muted-foreground">Name</dt>
            <dd>{me.data.profile.display_name ?? '—'}</dd>
            <dt className="text-muted-foreground">City</dt>
            <dd>{me.data.profile.city ?? '—'}</dd>
            <dt className="text-muted-foreground">Adult</dt>
            <dd>{me.data.profile.is_adult ? 'Yes' : 'No'}</dd>
            <dt className="text-muted-foreground">Taste profile</dt>
            <dd>
              {me.data.taste_profile
                ? `${me.data.taste_profile.interaction_count} interactions`
                : 'Not started'}
            </dd>
          </dl>
        )}
      </CardContent>
    </Card>
  );
}
