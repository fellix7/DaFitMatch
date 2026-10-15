import { useState } from 'react';
import { Link, useLocation } from 'react-router';
import { SignInDialog } from '@/components/SignInDialog';
import { Button } from '@/components/ui/button';
import { useSession } from '@/lib/session';
import { useRevealOnFirstScroll } from '@/lib/useRevealOnFirstScroll';
import { cn } from '@/lib/utils';

/**
 * Public-page header. The sign-in button lives in the top-right corner and stays there.
 * On the landing page it is hidden at first and slides in with the user's first scroll
 * (`revealOnScroll`); on every other public page it is visible from the start.
 */
export function SiteHeader({
  revealOnScroll = false,
  aside,
}: {
  revealOnScroll?: boolean;
  /** Optional small text shown next to the logo (e.g. "Answers are saved as you go"). */
  aside?: React.ReactNode;
}) {
  const signedIn = useSession((s) => Boolean(s.session));
  const location = useLocation();
  const revealed = useRevealOnFirstScroll(revealOnScroll);
  const [open, setOpen] = useState(false);
  const next = location.pathname.startsWith('/app') ? location.pathname : '/app/feed';

  return (
    <header
      className={cn(
        'sticky top-0 z-40 transition-[background-color,box-shadow,backdrop-filter] duration-300',
        revealed && 'bg-background/85 shadow-[0_1px_0_0_var(--border)] backdrop-blur',
      )}
    >
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4">
        <div className="flex min-w-0 items-center gap-3">
          <Link to="/" className="text-lg font-semibold tracking-tight">
            DaFitMatch
          </Link>
          {aside && (
            <span className="hidden truncate text-xs text-muted-foreground sm:inline">{aside}</span>
          )}
        </div>

        <div
          data-testid="header-auth"
          data-revealed={revealed}
          aria-hidden={!revealed}
          className={cn(
            'transition-[opacity,transform] duration-500 ease-out motion-reduce:transition-none',
            revealed ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-3 opacity-0',
          )}
        >
          {signedIn ? (
            <Button asChild size="sm" variant="outline" tabIndex={revealed ? 0 : -1}>
              <Link to="/app/feed">Open app</Link>
            </Button>
          ) : (
            <Button size="sm" tabIndex={revealed ? 0 : -1} onClick={() => setOpen(true)}>
              Sign in
            </Button>
          )}
        </div>
      </div>
      <SignInDialog open={open} onOpenChange={setOpen} next={next} />
    </header>
  );
}
