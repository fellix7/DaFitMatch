import { useEffect, useState } from 'react';

/** Becomes true on the first scroll past `threshold` px and then stays true ("latched"). */
export function useRevealOnFirstScroll(enabled: boolean, threshold = 24): boolean {
  const [revealed, setRevealed] = useState(!enabled);

  useEffect(() => {
    if (!enabled || revealed) return;
    const check = () => {
      if (window.scrollY > threshold) setRevealed(true);
    };
    check(); // e.g. page restored mid-scroll
    window.addEventListener('scroll', check, { passive: true });
    return () => window.removeEventListener('scroll', check);
  }, [enabled, revealed, threshold]);

  return revealed;
}
