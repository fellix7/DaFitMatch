import type { QuizCard, QuizSwipeAction } from '@dafitmatch/shared';
import { Heart, RotateCcw, ThumbsDown, ThumbsUp } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type MouseEvent, type TouchEvent } from 'react';
import { Button } from '@/components/ui/button';

/** How far a drag must travel (px) before it counts as a swipe. */
const SWIPE_THRESHOLD = 64;

export interface SwipeDeckProps {
  cards: readonly QuizCard[];
  /** Index of the card on screen. */
  index: number;
  /** Total cards in the run (the quiz contract's card count). */
  total: number;
  /** Called with the chosen action; the parent advances the deck. */
  onAction: (action: QuizSwipeAction) => void;
  /** Called when the user undoes the last swipe. */
  onUndo: () => void;
  /** Whether an undo is possible. */
  canUndo: boolean;
}

interface Point {
  x: number;
  y: number;
}

function startPoint(event: MouseEvent | TouchEvent): Point {
  if ('touches' in event) {
    const touch = event.touches[0] ?? event.changedTouches[0];
    return { x: touch?.clientX ?? 0, y: touch?.clientY ?? 0 };
  }
  return { x: event.clientX, y: event.clientY };
}

function endPoint(event: MouseEvent | TouchEvent): Point {
  if ('changedTouches' in event) {
    const touch = event.changedTouches[0];
    return { x: touch?.clientX ?? 0, y: touch?.clientY ?? 0 };
  }
  return { x: event.clientX, y: event.clientY };
}

/** Warms the next card's images so the swipe never shows an empty frame. */
function preloadImages(cards: readonly QuizCard[], index: number): void {
  const next = cards[index + 1];
  if (!next) return;
  for (const url of next.image_urls) {
    const image = new Image();
    image.src = url;
  }
}

/**
 * The onboarding swipe deck: one card at a time, with keyboard and drag gestures, an undo, a
 * progress bar and a preloaded next card.
 */
export function SwipeDeck({ cards, index, total, onAction, onUndo, canUndo }: SwipeDeckProps) {
  const [drag, setDrag] = useState<Point>({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const origin = useRef<Point | null>(null);
  const current = cards[index];

  useEffect(() => {
    preloadImages(cards, index);
  }, [cards, index]);

  const act = useCallback(
    (action: QuizSwipeAction) => {
      setDrag({ x: 0, y: 0 });
      setDragging(false);
      origin.current = null;
      onAction(action);
    },
    [onAction],
  );

  // Keyboard: left = skip, right = like, up = love, backspace = undo.
  useEffect(() => {
    if (!current) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      switch (event.key) {
        case 'ArrowLeft':
          event.preventDefault();
          act('skip');
          break;
        case 'ArrowRight':
          event.preventDefault();
          act('like');
          break;
        case 'ArrowUp':
          event.preventDefault();
          act('love');
          break;
        case 'Backspace':
          event.preventDefault();
          if (canUndo) onUndo();
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [act, canUndo, current, onUndo]);

  const onDragStart = (event: MouseEvent | TouchEvent) => {
    origin.current = startPoint(event);
    setDragging(true);
  };

  const onDragMove = (event: MouseEvent | TouchEvent) => {
    if (!origin.current) return;
    const point = 'touches' in event ? event.touches[0] : event;
    if (!point) return;
    setDrag({ x: point.clientX - origin.current.x, y: point.clientY - origin.current.y });
  };

  const onDragEnd = (event: MouseEvent | TouchEvent) => {
    if (!origin.current) return;
    const end = endPoint(event);
    const dx = end.x - origin.current.x;
    const dy = end.y - origin.current.y;
    origin.current = null;
    setDragging(false);
    if (Math.abs(dx) < SWIPE_THRESHOLD && Math.abs(dy) < SWIPE_THRESHOLD) {
      setDrag({ x: 0, y: 0 });
      return;
    }
    if (Math.abs(dx) >= Math.abs(dy)) act(dx > 0 ? 'like' : 'skip');
    else act(dy < 0 ? 'love' : 'skip');
  };

  if (!current) return null;

  const rotation = drag.x / 20;
  const progress = total > 0 ? Math.min(index / total, 1) : 0;

  return (
    <div className="grid gap-4">
      <div
        className="grid gap-2"
        role="progressbar"
        aria-label="Swipe progress"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={Math.min(index + 1, total)}
      >
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-200"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground" aria-live="polite">
          Card {Math.min(index + 1, total)} of {total}
        </p>
      </div>

      <div
        className="relative touch-pan-y select-none"
        onMouseDown={onDragStart}
        onMouseMove={onDragMove}
        onMouseUp={onDragEnd}
        onMouseLeave={onDragEnd}
        onTouchStart={onDragStart}
        onTouchMove={onDragMove}
        onTouchEnd={onDragEnd}
        style={{ transform: `translate(${drag.x}px, ${drag.y}px) rotate(${rotation}deg)` }}
      >
        <div className="grid grid-cols-2 gap-2">
          {current.image_urls.map((url, i) => (
            <img
              key={`${current.id}-${i}`}
              src={url}
              alt="Style option"
              draggable={false}
              className="col-span-2 aspect-[3/4] w-full rounded-xl border object-cover sm:col-span-1"
            />
          ))}
        </div>
        {dragging && (
          <p
            className="pointer-events-none absolute top-3 left-3 rounded-full bg-background/90 px-3 py-1 text-xs font-medium"
            aria-hidden
          >
            {drag.x > SWIPE_THRESHOLD ? 'Like' : drag.x < -SWIPE_THRESHOLD ? 'Skip' : 'Move'}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={() => act('skip')}>
          <ThumbsDown className="size-4" aria-hidden />
          Skip
        </Button>
        <Button variant="outline" onClick={() => act('like')}>
          <ThumbsUp className="size-4" aria-hidden />
          Like
        </Button>
        <Button onClick={() => act('love')}>
          <Heart className="size-4" aria-hidden />
          Love
        </Button>
        <Button variant="ghost" size="sm" onClick={onUndo} disabled={!canUndo} className="ml-auto">
          <RotateCcw className="size-4" aria-hidden />
          Undo
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Drag the card, or use the arrow keys: ← skip, → like, ↑ love.
      </p>
    </div>
  );
}
