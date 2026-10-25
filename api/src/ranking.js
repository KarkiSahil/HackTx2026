const DAY_MS = 24 * 60 * 60 * 1000;

// Freshness falls to ~37% after two weeks.
const FRESHNESS_DAYS = 14;
// Items opened by fewer people than this get the "unheard" boost.
const UNHEARD_BELOW = 5;
const UNHEARD_BOOST = 1;
const FELT_BOOST_MAX = 0.2;
const ALREADY_OPENED_PENALTY = 2;

export function rankScore(item, { now, viewCount = 0, feltCount = 0, openedByViewer = false }) {
  const ageDays = Math.max(0, (now - new Date(item.created_at).getTime()) / DAY_MS);
  const freshness = Math.exp(-ageDays / FRESHNESS_DAYS);
  const unheard = viewCount < UNHEARD_BELOW ? UNHEARD_BOOST : 0;
  const felt = FELT_BOOST_MAX * (Math.min(feltCount, 5) / 5);
  return freshness + unheard + felt - (openedByViewer ? ALREADY_OPENED_PENALTY : 0);
}

const newestFirst = (a, b) => new Date(b.created_at) - new Date(a.created_at);

// sort: "ranked" (fresh + unheard first), "newest", "oldest", or "feeling"
// (grouped by feeling, newest first within each; untagged last).
export function sortItems(items, sort, signals) {
  const list = [...items];
  if (sort === "newest") return list.sort(newestFirst);
  if (sort === "oldest") return list.sort((a, b) => -newestFirst(a, b));
  if (sort === "feeling") {
    return list.sort((a, b) => {
      if (a.feeling !== b.feeling) {
        if (!a.feeling) return 1;
        if (!b.feeling) return -1;
        return a.feeling.localeCompare(b.feeling);
      }
      return newestFirst(a, b);
    });
  }
  const now = signals.now ?? Date.now();
  const scored = list.map((item) => ({
    item,
    score: rankScore(item, {
      now,
      viewCount: signals.viewCounts.get(item.id) ?? 0,
      feltCount: signals.feltCounts.get(item.id) ?? 0,
      openedByViewer: signals.openedByViewer.has(item.id),
    }),
  }));
  return scored.sort((a, b) => b.score - a.score || newestFirst(a.item, b.item)).map((s) => s.item);
}
