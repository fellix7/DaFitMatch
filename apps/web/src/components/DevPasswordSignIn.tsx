import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { safeNext, signInWithDevPassword } from '@/lib/auth';
import { env } from '@/lib/env';

/**
 * DEV/TESTING ONLY. Lets the team sign in with the shared developer account while Google sign-in
 * is being set up. Rendered only when VITE_DEV_PASSWORD_LOGIN=true (never enable in production).
 * On success it goes through /auth/callback, so any pending style answers are saved as usual.
 */
export function DevPasswordSignIn({ next }: { next?: string }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'error'>('idle');

  if (!env.VITE_DEV_PASSWORD_LOGIN) return null;

  return (
    <form
      className="grid gap-2 rounded-lg border border-dashed p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setState('busy');
        try {
          await signInWithDevPassword(email, password);
          navigate(`/auth/callback?next=${encodeURIComponent(safeNext(next))}`);
        } catch {
          setState('error');
        }
      }}
    >
      <p className="text-xs font-medium text-muted-foreground">Developer sign-in (testing only)</p>
      <Input
        type="email"
        autoComplete="username"
        placeholder="Email"
        aria-label="Developer email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      <Input
        type="password"
        autoComplete="current-password"
        placeholder="Password"
        aria-label="Developer password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />
      {state === 'error' && (
        <p role="alert" className="text-sm text-destructive">
          Could not sign in. Check the email and password.
        </p>
      )}
      <Button type="submit" variant="secondary" disabled={state === 'busy'}>
        {state === 'busy' ? 'Signing in…' : 'Sign in as developer'}
      </Button>
    </form>
  );
}
