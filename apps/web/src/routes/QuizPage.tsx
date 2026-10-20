import {
  BUDGET_BANDS,
  COLOR_VOCAB,
  FIT_PREF_OPTIONS,
  LAUNCH_CITY,
  NEVER_WEAR_OPTIONS,
  QUIZ_CARD_COUNT,
  type ColorVocab,
  type QuizCatalog,
  type QuizSwipe,
  type QuizSwipeAction,
} from '@dafitmatch/shared';
import { Check } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Chip, ChipGroup } from '@/components/Chip';
import { FullPageMessage } from '@/components/ComingSoon';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useQuizCards, useSubmitQuiz } from '@/lib/queries';
import { COLOR_HEX, COMFORT_LABELS, QUIZ_CATALOG } from '@/lib/styleOptions';

type Step = 'basics' | 'swipe' | 'rules' | 'result';

const BUDGET_OPTIONS = BUDGET_BANDS.map((b) => ({ value: b.id, label: b.label }));

function toggle<T extends string>(list: readonly T[], item: T, max: number): T[] {
  if (list.includes(item)) return list.filter((x) => x !== item);
  return list.length >= max ? [...list] : [...list, item];
}

/** Visual onboarding quiz: a few basics, a run of swipe cards, then hard colour rules. */
export function QuizPage() {
  const [step, setStep] = useState<Step>('basics');
  const [, setStepHistory] = useState<Step[]>([]);
  const [catalog, setCatalog] = useState<QuizCatalog>('both');
  const [city, setCity] = useState(LAUNCH_CITY);
  const [budgetBand, setBudgetBand] = useState(BUDGET_OPTIONS[1]!.value);
  const [heightCm, setHeightCm] = useState<number | undefined>();
  const [fitPref, setFitPref] = useState<(typeof FIT_PREF_OPTIONS)[number] | undefined>();
  const [index, setIndex] = useState(0);
  const [swipes, setSwipes] = useState<QuizSwipe[]>([]);
  const [colorsLike, setColorsLike] = useState<ColorVocab[]>([]);
  const [colorsAvoid, setColorsAvoid] = useState<ColorVocab[]>([]);
  const [neverWear, setNeverWear] = useState<(typeof NEVER_WEAR_OPTIONS)[number][]>([]);
  const [comfort, setComfort] = useState(50);

  const gender = QUIZ_CATALOG.find((c) => c.value === catalog)?.gender;
  const cardsQuery = useQuizCards(gender);
  const submit = useSubmitQuiz();

  const go = (next: Step) => {
    setStepHistory((h) => [...h, step]);
    setStep(next);
  };
  const back = () => {
    setStepHistory((h) => {
      const prev = h[h.length - 1];
      if (prev) setStep(prev);
      return h.slice(0, -1);
    });
  };

  const cards = (cardsQuery.data?.cards ?? []).slice(0, QUIZ_CARD_COUNT);
  const current = cards[index];

  const act = (action: QuizSwipeAction) => {
    if (!current) return;
    setSwipes((s) => [...s, { card_id: current.id, action }]);
    if (index + 1 >= QUIZ_CARD_COUNT) go('rules');
    else setIndex(index + 1);
  };

  const cycleColor = (name: ColorVocab) => {
    const liked = colorsLike.includes(name);
    const avoided = colorsAvoid.includes(name);
    const like = colorsLike.filter((x) => x !== name);
    const avoid = colorsAvoid.filter((x) => x !== name);
    if (!liked && !avoided && like.length < 8) like.push(name);
    else if (liked && avoid.length < 8) avoid.push(name);
    setColorsLike(like);
    setColorsAvoid(avoid);
  };

  const onSubmit = () => {
    submit.mutate(
      {
        basics: {
          catalog,
          city: city.trim() || LAUNCH_CITY,
          budget_band: budgetBand,
          ...(heightCm !== undefined && { height_cm: heightCm }),
          ...(fitPref !== undefined && { fit_pref: fitPref }),
        },
        swipes,
        hard_rules: {
          colors_like: colorsLike,
          colors_avoid: colorsAvoid,
          never_wear: neverWear,
          comfort_vs_statement: comfort,
        },
      },
      { onSuccess: () => setStep('result') },
    );
  };

  return (
    <div className="grid gap-5">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Find your style</h1>
        <p className="text-sm text-muted-foreground">
          Swipe real outfits, set a few rules, and we will rank the catalog to your taste.
        </p>
      </div>

      {step !== 'basics' && (
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={back}>
            Back
          </Button>
          {step === 'swipe' && (
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {Math.min(index + 1, QUIZ_CARD_COUNT)} / {QUIZ_CARD_COUNT}
            </p>
          )}
        </div>
      )}

      {step === 'basics' && (
        <Card>
          <CardHeader>
            <CardTitle>Quick basics</CardTitle>
            <CardDescription>Two taps and you are swiping.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            <div className="grid gap-2">
              <p className="text-sm font-medium">Show me</p>
              <ChipGroup
                label="Catalog"
                options={QUIZ_CATALOG.map((c) => ({ value: c.value, label: c.label }))}
                value={catalog}
                onChange={setCatalog}
              />
            </div>
            <div className="grid gap-2">
              <p className="text-sm font-medium">Budget per outfit</p>
              <ChipGroup
                label="Budget band"
                options={BUDGET_OPTIONS}
                value={budgetBand}
                onChange={setBudgetBand}
              />
            </div>
            <label className="grid max-w-xs gap-1 text-sm">
              City
              <Input value={city} onChange={(e) => setCity(e.target.value)} maxLength={80} />
            </label>
            <div className="grid max-w-xs gap-3">
              <label className="grid gap-1 text-sm">
                Height in cm (optional)
                <Input
                  type="number"
                  inputMode="numeric"
                  min={100}
                  max={250}
                  value={heightCm ?? ''}
                  onChange={(e) => setHeightCm(e.target.value ? Number(e.target.value) : undefined)}
                />
              </label>
              <div className="grid gap-2">
                <p className="text-sm">Fit preference (optional)</p>
                <ChipGroup
                  label="Fit preference"
                  options={FIT_PREF_OPTIONS.map((v) => ({ value: v, label: v }))}
                  value={fitPref}
                  onChange={setFitPref}
                />
              </div>
            </div>
            <div>
              <Button onClick={() => go('swipe')}>Start swiping</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'swipe' && (
        <Card>
          <CardHeader>
            <CardTitle>Swipe the looks</CardTitle>
            <CardDescription>Love it, like it, or skip it.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {cardsQuery.isPending && <FullPageMessage>Loading cards…</FullPageMessage>}
            {cardsQuery.isError && (
              <div className="flex items-center gap-3 text-sm">
                <span className="text-destructive">Could not load cards.</span>
                <Button size="sm" variant="outline" onClick={() => cardsQuery.refetch()}>
                  Retry
                </Button>
              </div>
            )}
            {!cardsQuery.isPending && cards.length < QUIZ_CARD_COUNT && (
              <p className="text-sm text-muted-foreground">
                Not enough style cards for this section yet ({cards.length}/{QUIZ_CARD_COUNT}). Try
                another catalog or check back soon.
              </p>
            )}
            {current && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  {current.image_urls.map((url, i) => (
                    <img
                      key={`${current.id}-${i}`}
                      src={url}
                      alt="Style option"
                      loading="lazy"
                      className="col-span-2 aspect-[3/4] w-full rounded-xl border object-cover sm:col-span-1"
                    />
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => act('skip')}>
                    Skip
                  </Button>
                  <Button onClick={() => act('like')}>Like</Button>
                  <Button onClick={() => act('love')}>Love</Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {step === 'rules' && (
        <Card>
          <CardHeader>
            <CardTitle>Your rules</CardTitle>
            <CardDescription>
              Tap a colour once to love it, again to avoid it, again to clear.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            <div className="flex flex-wrap gap-2">
              {COLOR_VOCAB.map((name) => {
                const liked = colorsLike.includes(name);
                const avoided = colorsAvoid.includes(name);
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => cycleColor(name)}
                    aria-label={`${name}: ${liked ? 'loved' : avoided ? 'avoided' : 'neutral'}`}
                    className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm capitalize outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[state=avoid]:line-through data-[state=avoid]:opacity-60 data-[state=like]:border-primary data-[state=like]:ring-2 data-[state=like]:ring-primary/30"
                    data-state={liked ? 'like' : avoided ? 'avoid' : 'none'}
                  >
                    <span
                      className="size-4 rounded-full border"
                      style={{ backgroundColor: COLOR_HEX[name] ?? 'transparent' }}
                      aria-hidden
                    />
                    {name}
                    {liked && <Check className="size-3" aria-hidden />}
                  </button>
                );
              })}
            </div>
            <div className="grid gap-2">
              <p className="text-sm font-medium">Never put me in</p>
              <div className="flex flex-wrap gap-2">
                {NEVER_WEAR_OPTIONS.map((item) => (
                  <Chip
                    key={item}
                    selected={neverWear.includes(item)}
                    onToggle={() => setNeverWear((n) => toggle(n, item, 12))}
                  >
                    {item}
                  </Chip>
                ))}
              </div>
            </div>
            <label className="grid gap-2 text-sm">
              <span>
                Comfort vs statement:{' '}
                <strong>{COMFORT_LABELS[Math.round(comfort / 25) + 1]}</strong>
              </span>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={comfort}
                onChange={(e) => setComfort(Number(e.target.value))}
                className="accent-primary"
                aria-label="Comfort versus statement"
              />
            </label>
            {submit.isError && (
              <p role="alert" className="text-sm text-destructive">
                Could not save your quiz. Please try again.
              </p>
            )}
            <div>
              <Button
                onClick={onSubmit}
                disabled={submit.isPending || swipes.length < QUIZ_CARD_COUNT}
              >
                {submit.isPending ? 'Saving…' : 'See my style'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'result' && submit.data && (
        <Card>
          <CardHeader>
            <CardTitle>Your style is ready</CardTitle>
            <CardDescription>
              Budget set to ₹{submit.data.budget_inr.toLocaleString('en-IN')}.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <ul className="grid gap-2">
              {submit.data.top_archetypes.map((a) => (
                <li key={a.slug} className="rounded-lg border p-3">
                  <p className="text-sm font-medium">{a.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Inspired by {a.benchmark_brands.join(', ')}
                  </p>
                </li>
              ))}
            </ul>
            <div>
              <Button asChild>
                <Link to="/app/feed">See my feed</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
