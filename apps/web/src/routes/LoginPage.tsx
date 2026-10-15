import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, useLocation } from 'react-router';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

const Form = z.object({ email: z.email('Enter a valid email') });
type Form = z.infer<typeof Form>;

/** Passwordless sign-in: Supabase emails a magic link (locally it lands in Mailpit). */
export function LoginPage() {
  const session = useSession((s) => s.session);
  const location = useLocation();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<Form>({ resolver: zodResolver(Form) });

  const from = (location.state as { from?: string } | null)?.from;
  const next = from?.startsWith('/app/') ? from : '/app/feed';
  if (session) return <Navigate to={next} replace />;

  const onSubmit = async ({ email }: Form) => {
    setError(null);
    const { error: err } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}${next}` },
    });
    if (err) setError('Could not send the sign-in link. Please try again.');
    else setSentTo(email);
  };

  return (
    <div className="mx-auto grid min-h-dvh max-w-sm place-content-center px-4">
      <Card>
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>We will email you a one-tap sign-in link.</CardDescription>
        </CardHeader>
        <CardContent>
          {sentTo ? (
            <p className="text-sm" role="status">
              Check <strong>{sentTo}</strong> for your sign-in link.
            </p>
          ) : (
            <form className="grid gap-3" onSubmit={form.handleSubmit(onSubmit)} noValidate>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                aria-invalid={Boolean(form.formState.errors.email)}
                {...form.register('email')}
              />
              {(form.formState.errors.email || error) && (
                <p role="alert" className="text-sm text-destructive">
                  {form.formState.errors.email?.message ?? error}
                </p>
              )}
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? 'Sending…' : 'Email me a link'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
