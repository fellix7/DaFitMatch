import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { FullPageMessage } from '@/components/ComingSoon';
import { GoogleSignInButton } from '@/components/SignInDialog';
import { Button } from '@/components/ui/button';
import { safeNext } from '@/lib/auth';
import { useDraft, validateDraft } from '@/lib/draft';
import { useSaveTaste } from '@/lib/queries';
import { useSession } from '@/lib/session';

/**
 * Landing point after Google sign-in (and after "Generate fit" when already signed in).
 * 1. wait for supabase-js to finish the PKCE code exchange,
 * 2. if the guest left pending style answers, save them with PUT /me/taste,
 * 3. clear the local draft ONLY after the server confirmed the save,
 * 4. continue to `next` (the /app guards then run the one-time age gate if needed).
 */
export function AuthCallbackPage() {
  const { ready, session } = useSession();
  const { answers, pendingSave, clear } = useDraft();
  const saveTaste = useSaveTaste();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const started = useRef(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!ready || !session || started.current) return;
    started.current = true;

    const parsed = pendingSave ? validateDraft(answers) : null;
    if (!parsed?.success) {
      navigate(next, { replace: true });
      return;
    }
    saveTaste.mutate(parsed.data, {
      onSuccess: () => {
        clear();
        navigate(next, { replace: true });
      },
      onError: () => setFailed(true),
    });
  }, [ready, session, pendingSave, answers, next, navigate, saveTaste, clear, attempt]);

  if (!ready) return <FullPageMessage>Signing you in…</FullPageMessage>;

  if (!session) {
    return (
      <FullPageMessage>
        <div className="grid max-w-sm gap-3 text-center">
          <p>Sign-in did not complete. Your answers are still saved on this device.</p>
          <GoogleSignInButton next={next} />
          <Link className="underline" to="/try">
            Back to my answers
          </Link>
        </div>
      </FullPageMessage>
    );
  }

  if (failed) {
    return (
      <FullPageMessage>
        <div className="grid max-w-sm gap-3 text-center">
          <p>We could not save your answers just now. They are still kept on this device.</p>
          <Button
            onClick={() => {
              started.current = false;
              setFailed(false);
              setAttempt((a) => a + 1);
            }}
          >
            Try again
          </Button>
        </div>
      </FullPageMessage>
    );
  }

  return <FullPageMessage>Saving your style…</FullPageMessage>;
}
