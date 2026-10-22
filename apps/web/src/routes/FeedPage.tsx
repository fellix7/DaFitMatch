import {
  AFFILIATE_DISCLOSURE,
  type InteractionAction,
  type RankedProduct,
  type Slot,
} from '@dafitmatch/shared';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Chip } from '@/components/Chip';
import { FullPageMessage } from '@/components/ComingSoon';
import { LoadMore } from '@/components/LoadMore';
import { MeCard } from '@/components/MeCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useFeedProducts, useMe, useRecordInteraction } from '@/lib/queries';
import { track } from '@/lib/analytics';
import { FEED_SLOTS } from '@/lib/styleOptions';

const ACTIONS: { action: InteractionAction; label: string }[] = [
  { action: 'love', label: 'Love' },
  { action: 'save', label: 'Save' },
  { action: 'skip', label: 'Skip' },
];

const REACTION_LABELS: Record<InteractionAction, string> = {
  love: 'Loved',
  like: 'Liked',
  save: 'Saved',
  skip: 'Skipped',
  click: 'Opened',
  tryon: 'Tried on',
  swap: 'Swapped',
};

function ProductCard({
  item,
  onAction,
  reaction,
}: {
  item: RankedProduct;
  onAction: (action: InteractionAction) => void;
  /** The action already taken on this product (optimistic). */
  reaction?: InteractionAction;
}) {
  const { product, reason_tags } = item;
  return (
    <Card className="overflow-hidden">
      <img
        src={product.image_url}
        alt={product.title}
        loading="lazy"
        className="aspect-[3/4] w-full object-cover"
      />
      <CardContent className="grid gap-2 pt-4">
        <p className="text-xs tracking-wide text-muted-foreground uppercase">{product.brand}</p>
        <p className="text-sm font-medium">{product.title}</p>
        <p className="text-sm">₹{product.price_inr.toLocaleString('en-IN')}</p>
        {reaction && (
          <p className="text-xs font-medium text-primary" data-testid="reaction">
            {REACTION_LABELS[reaction]}
          </p>
        )}
        {reason_tags.length > 0 && (
          <p className="text-xs text-muted-foreground">{reason_tags.join(' · ')}</p>
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          {ACTIONS.map(({ action, label }) => (
            <Button
              key={action}
              size="sm"
              variant="outline"
              disabled={reaction !== undefined}
              onClick={() => onAction(action)}
            >
              {label}
            </Button>
          ))}
        </div>
        <a
          className="text-xs underline"
          href={product.affiliate_url}
          target="_blank"
          rel="noreferrer noopener sponsored"
        >
          Shop this
        </a>
        <p className="text-[11px] leading-snug text-muted-foreground">{AFFILIATE_DISCLOSURE}</p>
      </CardContent>
    </Card>
  );
}

/** Taste-ranked catalog feed; every action teaches the taste vector. */
export function FeedPage() {
  const [slot, setSlot] = useState<Slot | undefined>();
  const me = useMe();
  const maxPrice = me.data?.profile.default_budget_inr ?? undefined;
  const feed = useFeedProducts({ slot, max_price: maxPrice });
  const record = useRecordInteraction();

  const products = feed.data?.pages.flatMap((p) => p.products) ?? [];
  const reactions = useMemo(() => {
    const map = new Map<string, InteractionAction>();
    for (const page of feed.data?.pages ?? []) {
      for (const [id, action] of Object.entries(page.reacted ?? {})) map.set(id, action);
    }
    return map;
  }, [feed.data]);
  const isEmpty = !feed.isPending && !feed.isError && products.length === 0;

  useEffect(() => {
    track('feed_viewed', { slot: slot ?? 'all' });
  }, [slot]);

  return (
    <div className="grid gap-4">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Your feed</h1>
        <p className="text-sm text-muted-foreground">Ranked to the style you saved.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Chip selected={slot === undefined} onToggle={() => setSlot(undefined)}>
          All
        </Chip>
        {FEED_SLOTS.map((s) => (
          <Chip key={s.value} selected={slot === s.value} onToggle={() => setSlot(s.value)}>
            {s.label}
          </Chip>
        ))}
      </div>

      {feed.isPending && <FullPageMessage>Loading your feed…</FullPageMessage>}
      {feed.isError && (
        <div className="flex items-center gap-3 text-sm">
          <span className="text-destructive">Could not load your feed.</span>
          <Button size="sm" variant="outline" onClick={() => feed.refetch()}>
            Retry
          </Button>
        </div>
      )}

      {isEmpty && (
        <Card>
          <CardContent className="grid gap-3 pt-6 text-sm">
            <p>No pieces match yet. Complete the style quiz to tune your feed.</p>
            <div>
              <Button asChild size="sm">
                <Link to="/app/quiz">Take the style quiz</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {products.map((item) => (
          <ProductCard
            key={item.product.id}
            item={item}
            reaction={reactions.get(item.product.id)}
            onAction={(action) =>
              record.mutate({
                target_type: 'product',
                target_id: item.product.id,
                action,
              })
            }
          />
        ))}
      </div>

      <LoadMore
        hasMore={feed.hasNextPage}
        isLoading={feed.isFetchingNextPage}
        onLoadMore={() => {
          track('feed_load_more');
          void feed.fetchNextPage();
        }}
      />

      <MeCard />
    </div>
  );
}
