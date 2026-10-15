import { useState } from 'react';
import { DevPasswordSignIn } from '@/components/DevPasswordSignIn';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { signInWithGoogle } from '@/lib/auth';

function GoogleLogo() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.06H2.18A11 11 0 0 0 1 12c0 1.78.43 3.45 1.18 4.94l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
      />
    </svg>
  );
}

export function GoogleSignInButton({ next }: { next?: string }) {
  const [state, setState] = useState<'idle' | 'redirecting' | 'error'>('idle');

  return (
    <div className="grid gap-2">
      <Button
        size="lg"
        variant="outline"
        disabled={state === 'redirecting'}
        onClick={async () => {
          setState('redirecting');
          try {
            await signInWithGoogle(next);
          } catch {
            setState('error');
          }
        }}
      >
        <GoogleLogo />
        {state === 'redirecting' ? 'Opening Google…' : 'Continue with Google'}
      </Button>
      {state === 'error' && (
        <p role="alert" className="text-sm text-destructive">
          Google sign-in is not available right now. Please try again in a moment.
        </p>
      )}
    </div>
  );
}

/** Shown when a guest presses "Generate fit". Their answers are already saved in the browser. */
export function SignInDialog({
  open,
  onOpenChange,
  next,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  next?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sign in to generate your fit</DialogTitle>
          <DialogDescription>
            Your answers are kept and saved to your profile as soon as you sign in, so you will not
            have to fill them in again.
          </DialogDescription>
        </DialogHeader>
        <GoogleSignInButton next={next} />
        <DevPasswordSignIn next={next} />
        <p className="text-xs text-muted-foreground">
          By continuing you agree to our terms and privacy policy.
        </p>
      </DialogContent>
    </Dialog>
  );
}
