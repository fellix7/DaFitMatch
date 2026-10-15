# 0008 — Some Indian ISPs block `*.supabase.co`

- **Status:** Proposed — fix deferred until the main build is done (product-owner decision, 2026-10-15).

## Context

On ACT Fibernet (Delhi) every DNS lookup of `*.supabase.co` — even to 1.1.1.1 / 8.8.8.8 — returns an ISP
address and HTTPS is reset. DNS-over-HTTPS returns Supabase's real Cloudflare IPs and connections work, so
it is a DNS-level block. `supabase.com` and other hosts are unaffected. Our target users are in India, so
some of them will hit this.

## Options

1. **Proxy through our own domain (recommended):** the browser only talks to the DaFitMatch domain. A
   rewrite (Vercel) forwards `/auth/v1/*` (and later `/storage/v1/*`) to Supabase. Google sign-in uses
   Google Identity Services in a popup to get an ID token, exchanged with `signInWithIdToken` through the
   proxy, so no redirect ever touches `supabase.co`. The API (hosted outside India) talks to Supabase
   directly.
2. Supabase custom domain (paid add-on). May still be affected if the ISP blocks by resolution chain.
3. Do nothing: users on blocking ISPs cannot sign in.

## Current workaround (developers)

Enable DNS-over-HTTPS on your machine (Windows: Settings → Network → DNS server assignment → DNS over
HTTPS on, 1.1.1.1). Run the embedder from Colab/Kaggle if needed.
