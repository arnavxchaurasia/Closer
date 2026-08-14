export interface Festival {
  name: string;
  emoji: string;
  date: string;       // YYYY-MM-DD
  color: string;
  greeting: string;
  // used to generate "your Nth X together" — true for annual couple festivals
  couple?: boolean;
}

export const FESTIVALS: Festival[] = [
  // ── 2025 ──────────────────────────────────────────────────────────────────
  { name: "Valentine's Day",  emoji: "💝", date: "2025-02-14", color: "#E8607A", greeting: "Love is in the air",       couple: true  },
  { name: "Holi",             emoji: "🎨", date: "2025-03-14", color: "#FF6B35", greeting: "Celebrate colour together", couple: true  },
  { name: "Eid al-Fitr",      emoji: "🌙", date: "2025-03-30", color: "#22C55E", greeting: "Eid Mubarak to you both",  couple: false },
  { name: "Easter",           emoji: "🐣", date: "2025-04-20", color: "#84CC16", greeting: "Happy Easter!",            couple: false },
  { name: "Raksha Bandhan",   emoji: "🪢", date: "2025-08-09", color: "#F59E0B", greeting: "Celebrate your bond",      couple: true  },
  { name: "Independence Day", emoji: "🇮🇳", date: "2025-08-15", color: "#FF9933", greeting: "Happy Independence Day",  couple: true  },
  { name: "Navratri",         emoji: "🕺", date: "2025-10-02", color: "#C084FC", greeting: "Navratri blessings",       couple: false },
  { name: "Karva Chauth",     emoji: "🌕", date: "2025-10-20", color: "#D97706", greeting: "A fast of love",           couple: true  },
  { name: "Diwali",           emoji: "🪔", date: "2025-10-20", color: "#F59E0B", greeting: "A glowing Diwali together",couple: true  },
  { name: "Christmas",        emoji: "🎄", date: "2025-12-25", color: "#22C55E", greeting: "Merry Christmas!",         couple: false },
  { name: "New Year's Eve",   emoji: "🎆", date: "2025-12-31", color: "#6366F1", greeting: "Last night of the year",   couple: true  },
  // ── 2026 ──────────────────────────────────────────────────────────────────
  { name: "New Year",         emoji: "🎉", date: "2026-01-01", color: "#6366F1", greeting: "Happy New Year! Here's to us", couple: true },
  { name: "Valentine's Day",  emoji: "💝", date: "2026-02-14", color: "#E8607A", greeting: "Love is in the air",           couple: true },
  { name: "Holi",             emoji: "🎨", date: "2026-03-04", color: "#FF6B35", greeting: "Celebrate colour together",    couple: true },
  { name: "Eid al-Fitr",      emoji: "🌙", date: "2026-03-19", color: "#22C55E", greeting: "Eid Mubarak to you both",     couple: false },
  { name: "Easter",           emoji: "🐣", date: "2026-04-05", color: "#84CC16", greeting: "Happy Easter!",               couple: false },
  { name: "Raksha Bandhan",   emoji: "🪢", date: "2026-07-29", color: "#F59E0B", greeting: "Celebrate your bond",         couple: true },
  { name: "Independence Day", emoji: "🇮🇳", date: "2026-08-15", color: "#FF9933", greeting: "Happy Independence Day",     couple: true },
  { name: "Karva Chauth",     emoji: "🌕", date: "2026-10-09", color: "#D97706", greeting: "A fast of love",              couple: true },
  { name: "Diwali",           emoji: "🪔", date: "2026-11-08", color: "#F59E0B", greeting: "A glowing Diwali together",   couple: true },
  { name: "Christmas",        emoji: "🎄", date: "2026-12-25", color: "#22C55E", greeting: "Merry Christmas!",            couple: false },
  { name: "New Year's Eve",   emoji: "🎆", date: "2026-12-31", color: "#6366F1", greeting: "Last night of the year",      couple: true },
];

function ordinal(n: number): string {
  if (n <= 0) return '';
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

export interface FestivalResult extends Festival {
  daysAway: number;
  personalGreeting: string; // possibly "Your 3rd Independence Day together 🇮🇳"
}

/**
 * Returns the next upcoming festival within 30 days.
 * Pass `togetherSince` (ISO date) to personalise with ordinal count.
 */
export function getNextFestival(togetherSince?: string): FestivalResult | null {
  const now = Date.now();

  for (const f of FESTIVALS) {
    const festMs   = new Date(f.date).getTime();
    const daysAway = Math.ceil((festMs - now) / 86_400_000);
    if (daysAway < -1 || daysAway > 30) continue;

    let personalGreeting = f.greeting;

    if (f.couple && togetherSince) {
      const sinceMs = new Date(togetherSince).getTime();
      if (!isNaN(sinceMs)) {
        const festYear   = new Date(f.date).getFullYear();
        const sinceYear  = new Date(togetherSince).getFullYear();
        const n = festYear - sinceYear + 1; // 1 = first occurrence together
        if (n >= 1) {
          personalGreeting = `Your ${ordinal(n)} ${f.name} together`;
        }
      }
    }

    return { ...f, daysAway, personalGreeting };
  }
  return null;
}
