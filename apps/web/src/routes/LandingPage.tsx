import { HeartHandshake, MapPin, Shirt, ShoppingBag, Sparkles, WandSparkles } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { SignInDialog } from '@/components/SignInDialog';
import { Button } from '@/components/ui/button';
import { useSession } from '@/lib/session';

const STEPS = [
  {
    icon: Sparkles,
    title: 'Tell us your style',
    body: 'Pick the looks you love, colours you live in and the date you are planning. Two minutes, no sign-up.',
  },
  {
    icon: ShoppingBag,
    title: 'Get real outfits',
    body: 'We build complete looks from real products you can buy today, within your budget, and mix in pieces you already own.',
  },
  {
    icon: WandSparkles,
    title: 'See it on you',
    body: 'Try a look on your own photo before you buy, then pick a date spot in Delhi NCR that matches the vibe.',
  },
];

const FEATURES = [
  {
    icon: HeartHandshake,
    title: 'Dress as a pair',
    body: 'Open a date room with your partner. Match, complement, or let one of you lead, with one shared colour palette.',
  },
  {
    icon: Shirt,
    title: 'Your wardrobe counts',
    body: 'Add clothes you already own and we will style around them, so you only buy what is missing.',
  },
  {
    icon: MapPin,
    title: 'The right place',
    body: 'Curated Delhi NCR spots, from rooftops to galleries, picked to fit the look you lock in.',
  },
];

export function LandingPage() {
  const signedIn = useSession((s) => Boolean(s.session));
  const [signInOpen, setSignInOpen] = useState(false);

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5">
        <span className="text-lg font-semibold tracking-tight">DaFitMatch</span>
        {signedIn ? (
          <Button asChild variant="ghost" size="sm">
            <Link to="/app/feed">Open app</Link>
          </Button>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => setSignInOpen(true)}>
            Sign in
          </Button>
        )}
      </header>

      <main>
        <section className="mx-auto grid max-w-3xl gap-6 px-4 pt-12 pb-16 text-center sm:pt-20">
          <p className="text-sm font-medium tracking-wide text-muted-foreground uppercase">
            Date-night outfits, sorted
          </p>
          <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
            Look great together, without the guesswork.
          </h1>
          <p className="mx-auto max-w-xl text-lg text-pretty text-muted-foreground">
            DaFitMatch builds outfits for both of you from real clothes you can actually buy (or
            already own), shows them on you, and finds a spot in the city that matches the vibe.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button asChild size="lg">
              <Link to="/try">Try now, it&apos;s free</Link>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">No sign-up needed to start.</p>
        </section>

        <section aria-labelledby="how" className="bg-secondary/50 py-16">
          <div className="mx-auto max-w-5xl px-4">
            <h2 id="how" className="mb-8 text-center text-2xl font-semibold tracking-tight">
              How it works
            </h2>
            <ol className="grid gap-6 sm:grid-cols-3">
              {STEPS.map(({ icon: Icon, title, body }, i) => (
                <li key={title} className="rounded-xl border bg-card p-6">
                  <div className="mb-3 flex items-center gap-3">
                    <span className="grid size-9 place-items-center rounded-full bg-accent text-accent-foreground">
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <span className="text-sm text-muted-foreground">Step {i + 1}</span>
                  </div>
                  <h3 className="mb-1 font-semibold">{title}</h3>
                  <p className="text-sm text-muted-foreground">{body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section aria-labelledby="why" className="py-16">
          <div className="mx-auto max-w-5xl px-4">
            <h2 id="why" className="mb-8 text-center text-2xl font-semibold tracking-tight">
              Made for two
            </h2>
            <div className="grid gap-6 sm:grid-cols-3">
              {FEATURES.map(({ icon: Icon, title, body }) => (
                <div key={title} className="grid gap-2">
                  <Icon className="size-5 text-primary" aria-hidden />
                  <h3 className="font-semibold">{title}</h3>
                  <p className="text-sm text-muted-foreground">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto grid max-w-3xl gap-4 px-4 pb-24 text-center">
          <h2 className="text-2xl font-semibold tracking-tight">
            Your next date look is two minutes away
          </h2>
          <div>
            <Button asChild size="lg">
              <Link to="/try">Build my fit</Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t py-6 text-center text-xs text-muted-foreground">
        Brands mentioned are style inspiration only and are not affiliated with DaFitMatch.
      </footer>

      <SignInDialog open={signInOpen} onOpenChange={setSignInOpen} />
    </div>
  );
}
