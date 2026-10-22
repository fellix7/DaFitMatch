import { env } from './env';

/**
 * Product analytics (PostHog).
 *
 * Analytics are optional: without `VITE_POSTHOG_KEY` every call is a no-op, so local and
 * preview builds never phone home. The SDK is loaded lazily, so it is not in the first paint.
 */
export type EventProps = Record<string, string | number | boolean | undefined>;

interface AnalyticsClient {
  capture: (event: string, props?: EventProps) => void;
  identify: (id: string) => void;
  reset: () => void;
}

let client: AnalyticsClient | null = null;
let loading: Promise<AnalyticsClient | null> | null = null;

async function getClient(): Promise<AnalyticsClient | null> {
  if (!env.VITE_POSTHOG_KEY) return null;
  if (client) return client;
  loading ??= import('posthog-js')
    .then((module) => {
      const posthog = module.default;
      posthog.init(env.VITE_POSTHOG_KEY!, {
        api_host: env.VITE_POSTHOG_HOST ?? 'https://eu.i.posthog.com',
        capture_pageview: false,
        persistence: 'localStorage+cookie',
      });
      client = posthog as unknown as AnalyticsClient;
      return client;
    })
    .catch(() => null);
  return loading;
}

/** Records a product event. Never throws and never blocks the UI. */
export function track(event: string, props?: EventProps): void {
  void getClient().then((c) => c?.capture(event, props));
}

/** Ties events to the signed-in user. */
export function identify(userId: string): void {
  void getClient().then((c) => c?.identify(userId));
}

/** Clears the identity on sign-out. */
export function resetAnalytics(): void {
  void getClient().then((c) => c?.reset());
}
