import type { StyleQuizAnswers } from '@dafitmatch/shared';
import { Check } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { Chip, ChipGroup } from '@/components/Chip';
import { SignInDialog } from '@/components/SignInDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useDraft, validateDraft } from '@/lib/draft';
import { useArchetypes } from '@/lib/queries';
import { useSession } from '@/lib/session';
import {
  BOTTOM_FITS,
  BUDGET_PRESETS,
  COLORS,
  COMFORT_LABELS,
  GENDER_PRESENTATION,
  NEVER_WEAR,
  OCCASIONS,
  SHOP_GENDER,
  TOP_FITS,
  WARDROBE_MODES,
} from '@/lib/styleOptions';

type FieldErrors = Partial<Record<keyof StyleQuizAnswers, string>>;

const FIELD_MESSAGES: Partial<Record<keyof StyleQuizAnswers, string>> = {
  gender_presentation: 'Pick how you like to dress.',
  shop_gender: 'Pick which section to shop from.',
  occasion: 'Pick the kind of date.',
  budget_inr: 'Set a budget between ₹500 and ₹2,00,000.',
  archetypes: 'Pick at least one style (up to three).',
};

function toggle(list: readonly string[] = [], item: string, max = Infinity): string[] {
  if (list.includes(item)) return list.filter((x) => x !== item);
  return list.length >= max ? [...list] : [...list, item];
}

function Section({
  id,
  title,
  hint,
  error,
  children,
}: {
  id: string;
  title: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="grid gap-3 rounded-xl border bg-card p-5">
      <div className="grid gap-1">
        <h2 id={id} className="font-semibold">
          {title}
        </h2>
        {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
      </div>
      {children}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}

/**
 * Guest style builder ("Try now"). Everything is kept in the browser as the user goes; pressing
 * "Generate fit" asks a guest to sign in, and the answers are saved to their profile afterwards.
 */
export function TryPage() {
  const { answers, set, markPendingSave } = useDraft();
  const signedIn = useSession((s) => Boolean(s.session));
  const archetypes = useArchetypes();
  const navigate = useNavigate();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [signInOpen, setSignInOpen] = useState(false);

  const archetypeNames = useMemo(
    () => new Map(archetypes.data?.archetypes.map((a) => [a.slug, a.name])),
    [archetypes.data],
  );

  const generate = () => {
    const result = validateDraft(answers);
    if (!result.success) {
      const next: FieldErrors = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0] as keyof StyleQuizAnswers;
        next[key] ??= FIELD_MESSAGES[key] ?? issue.message;
      }
      setErrors(next);
      const first = document.querySelector('[role="alert"]');
      first?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setErrors({});
    markPendingSave();
    if (signedIn) navigate('/auth/callback?next=/app/feed');
    else setSignInOpen(true);
  };

  return (
    <div className="mx-auto grid max-w-2xl gap-5 px-4 pt-6 pb-32">
      <header className="flex items-center justify-between">
        <Link to="/" className="text-lg font-semibold tracking-tight">
          DaFitMatch
        </Link>
        <span className="text-xs text-muted-foreground">Answers are saved as you go</span>
      </header>

      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Build your fit</h1>
        <p className="text-sm text-muted-foreground">
          Tell us about you and the date. We will put together complete looks from real pieces.
        </p>
      </div>

      <Section
        id="about"
        title="About you"
        error={errors.gender_presentation ?? errors.shop_gender}
      >
        <p className="text-sm">I usually dress</p>
        <ChipGroup
          label="How you dress"
          options={GENDER_PRESENTATION}
          value={answers.gender_presentation}
          onChange={(v) => set({ gender_presentation: v })}
        />
        <p className="text-sm">Show me clothes from</p>
        <ChipGroup
          label="Shop section"
          options={SHOP_GENDER}
          value={answers.shop_gender}
          onChange={(v) => set({ shop_gender: v })}
        />
        <label className="grid max-w-48 gap-1 text-sm">
          Height in cm (optional)
          <Input
            type="number"
            inputMode="numeric"
            min={100}
            max={250}
            value={answers.height_cm ?? ''}
            onChange={(e) =>
              set({ height_cm: e.target.value ? Number(e.target.value) : undefined })
            }
          />
        </label>
      </Section>

      <Section id="date" title="The date" error={errors.occasion ?? errors.budget_inr}>
        <div role="group" aria-label="Occasion" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {OCCASIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              aria-pressed={answers.occasion === o.value}
              onClick={() => set({ occasion: o.value })}
              className="rounded-lg border p-3 text-left transition-colors hover:bg-accent aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground"
            >
              <span className="block text-sm font-medium">{o.label}</span>
              <span className="block text-xs opacity-75">{o.hint}</span>
            </button>
          ))}
        </div>
        <p className="text-sm">Budget for the whole outfit</p>
        <div className="flex flex-wrap items-center gap-2">
          {BUDGET_PRESETS.map((b) => (
            <Chip
              key={b}
              selected={answers.budget_inr === b}
              onToggle={() => set({ budget_inr: b })}
            >
              ₹{b.toLocaleString('en-IN')}
            </Chip>
          ))}
          <label className="flex items-center gap-2 text-sm">
            or ₹
            <Input
              aria-label="Custom budget in rupees"
              type="number"
              inputMode="numeric"
              className="w-28"
              min={500}
              value={answers.budget_inr ?? ''}
              onChange={(e) =>
                set({ budget_inr: e.target.value ? Number(e.target.value) : undefined })
              }
            />
          </label>
        </div>
      </Section>

      <Section
        id="style"
        title="Styles you love"
        hint="Pick up to three, favourite first."
        error={errors.archetypes}
      >
        {archetypes.isPending && <p className="text-sm text-muted-foreground">Loading styles…</p>}
        {archetypes.isError && (
          <div className="flex items-center gap-3 text-sm">
            <span className="text-destructive">Could not load styles.</span>
            <Button size="sm" variant="outline" onClick={() => archetypes.refetch()}>
              Retry
            </Button>
          </div>
        )}
        <div className="grid gap-2 sm:grid-cols-2">
          {archetypes.data?.archetypes.map((a) => {
            const rank = answers.archetypes?.indexOf(a.slug) ?? -1;
            const selected = rank >= 0;
            const full = (answers.archetypes?.length ?? 0) >= 3;
            return (
              <button
                key={a.slug}
                type="button"
                aria-pressed={selected}
                disabled={!selected && full}
                onClick={() => set({ archetypes: toggle(answers.archetypes, a.slug, 3) })}
                className="relative grid gap-1 rounded-lg border p-3 text-left transition-colors hover:bg-accent disabled:opacity-40 aria-pressed:border-primary aria-pressed:ring-2 aria-pressed:ring-primary/30"
              >
                <span className="pr-8 text-sm font-medium">{a.name}</span>
                <span className="text-xs text-muted-foreground">
                  Inspired by {a.benchmark_brands.join(', ')}
                </span>
                {selected && (
                  <span className="absolute top-2 right-2 grid size-6 place-items-center rounded-full bg-primary text-xs text-primary-foreground">
                    {rank + 1}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {(answers.archetypes?.length ?? 0) > 0 && (
          <p className="text-xs text-muted-foreground">
            Your picks: {answers.archetypes!.map((s) => archetypeNames.get(s) ?? s).join(' → ')}
          </p>
        )}
      </Section>

      <Section
        id="colours"
        title="Colours"
        hint="Tap once to love it, again to avoid it, again to clear."
      >
        <div className="flex flex-wrap gap-2">
          {COLORS.map((c) => {
            const liked = answers.colors_like?.includes(c.name) ?? false;
            const avoided = answers.colors_avoid?.includes(c.name) ?? false;
            const cycle = () => {
              const like = (answers.colors_like ?? []).filter((x) => x !== c.name);
              const avoid = (answers.colors_avoid ?? []).filter((x) => x !== c.name);
              if (!liked && !avoided && like.length < 8) like.push(c.name);
              else if (liked && avoid.length < 8) avoid.push(c.name);
              set({ colors_like: like, colors_avoid: avoid });
            };
            return (
              <button
                key={c.name}
                type="button"
                onClick={cycle}
                aria-label={`${c.name}: ${liked ? 'loved' : avoided ? 'avoided' : 'neutral'}`}
                className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm capitalize data-[state=avoid]:line-through data-[state=avoid]:opacity-60 data-[state=like]:border-primary data-[state=like]:ring-2 data-[state=like]:ring-primary/30"
                data-state={liked ? 'like' : avoided ? 'avoid' : 'none'}
              >
                <span
                  className="size-4 rounded-full border"
                  style={{ backgroundColor: c.hex }}
                  aria-hidden
                />
                {c.name}
                {liked && <Check className="size-3" aria-hidden />}
              </button>
            );
          })}
        </div>
      </Section>

      <Section id="vibe" title="Your vibe">
        <label className="grid gap-2 text-sm">
          <span>
            Comfort vs statement:{' '}
            <strong>{COMFORT_LABELS[answers.comfort_vs_statement ?? 3]}</strong>
          </span>
          <input
            type="range"
            min={1}
            max={5}
            step={1}
            value={answers.comfort_vs_statement ?? 3}
            onChange={(e) => set({ comfort_vs_statement: Number(e.target.value) })}
            className="accent-primary"
          />
        </label>
        <p className="text-sm">Tops fit</p>
        <ChipGroup
          label="Top fit"
          options={TOP_FITS.map((v) => ({ value: v, label: v }))}
          value={answers.fit_prefs?.top}
          onChange={(v) => set({ fit_prefs: { ...answers.fit_prefs, top: v } })}
        />
        <p className="text-sm">Bottoms fit</p>
        <ChipGroup
          label="Bottom fit"
          options={BOTTOM_FITS.map((v) => ({ value: v, label: v }))}
          value={answers.fit_prefs?.bottom}
          onChange={(v) => set({ fit_prefs: { ...answers.fit_prefs, bottom: v } })}
        />
        <p className="text-sm">Never put me in</p>
        <div className="flex flex-wrap gap-2">
          {NEVER_WEAR.map((item) => (
            <Chip
              key={item}
              selected={answers.never_wear?.includes(item) ?? false}
              onToggle={() => set({ never_wear: toggle(answers.never_wear, item, 12) })}
            >
              {item}
            </Chip>
          ))}
        </div>
      </Section>

      <Section
        id="wardrobe"
        title="Your wardrobe"
        hint="You can add clothes you already own after you sign in."
      >
        <div role="group" aria-label="Wardrobe mode" className="grid gap-2 sm:grid-cols-3">
          {WARDROBE_MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              aria-pressed={answers.wardrobe_mode === m.value}
              onClick={() => set({ wardrobe_mode: m.value })}
              className="rounded-lg border p-3 text-left transition-colors hover:bg-accent aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground"
            >
              <span className="block text-sm font-medium">{m.label}</span>
              <span className="block text-xs opacity-75">{m.hint}</span>
            </button>
          ))}
        </div>
      </Section>

      <div className="fixed inset-x-0 bottom-0 border-t bg-background/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <p className="hidden text-xs text-muted-foreground sm:block">
            {signedIn
              ? 'Signed in: we will save this to your profile.'
              : 'No sign-up needed until you generate.'}
          </p>
          <Button size="lg" className="w-full sm:w-auto" onClick={generate}>
            Generate fit
          </Button>
        </div>
      </div>

      <SignInDialog open={signInOpen} onOpenChange={setSignInOpen} next="/app/feed" />
    </div>
  );
}
