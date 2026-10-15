# 0007 — Guest-first onboarding, Google sign-in

- **Status:** Accepted (2026-10-15), product-owner decision.

## Context

Asking for an account before showing value loses users. The product owner wants: landing page that hooks
the user → **Try now** → build a style profile as a guest → **Generate fit** → sign-in popup → answers
saved to the profile.

## Decision

- `/` landing page (no auth). A sticky header shows **Sign in** in the top-right corner; on the landing
  page it slides in on the first scroll and stays.
- `/try` guest style builder. Answers (`StyleQuizAnswers`) are kept in `localStorage`
  (`dafitmatch.style-draft.v1`) as the user goes, so they survive the OAuth redirect.
- **Generate fit** validates the answers, then opens a **Google sign-in** popup for guests.
- `/auth/callback` waits for the PKCE exchange, sends pending answers with `PUT /me/taste`, and clears
  the local draft **only after** the server confirms. On failure the answers stay and the user can retry.
- `/app/*` requires a session; a one-time **age gate** (`POST /me/age`) runs before the app.
- Magic-link email sign-in was removed.
- **Testing only:** while Google OAuth is being configured, the team uses one shared developer account
  (email + password, created in the Supabase dashboard). The form shows only when
  `VITE_DEV_PASSWORD_LOGIN=true`, which must never be set in production.

## Consequences

- `GET /archetypes` is public so guests can pick styles.
- The draft holds style preferences only (no birth date or other sensitive data).
- Google OAuth client must be created in Google Cloud and configured in Supabase (product owner).
