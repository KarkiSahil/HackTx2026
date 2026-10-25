import { useEffect, useState } from "react";
import { getPostcardUrl } from "./api";

const PAINT_WINDOW_MS = 3 * 60 * 1000;
const PAINT_POLL_MS = 4000;

const ageMs = (createdAt) => Date.now() - new Date(createdAt).getTime();

// The item's AI watercolor. For a fresh item the author just made, it is still
// being painted in the background, so check until it arrives.
export function usePostcard({ itemType, itemId, createdAt, initialUrl, watch }) {
  const [url, setUrl] = useState(initialUrl ?? null);
  const [expired, setExpired] = useState(() => ageMs(createdAt) > PAINT_WINDOW_MS);
  const painting = Boolean(watch) && !url && !expired;

  useEffect(() => {
    if (!painting) return undefined;
    const timer = setInterval(async () => {
      if (ageMs(createdAt) > PAINT_WINDOW_MS) {
        setExpired(true);
        return;
      }
      const found = await getPostcardUrl(itemType, itemId).catch(() => null);
      if (found) setUrl(found);
    }, PAINT_POLL_MS);
    return () => clearInterval(timer);
  }, [painting, itemType, itemId, createdAt]);

  return { url, painting };
}
