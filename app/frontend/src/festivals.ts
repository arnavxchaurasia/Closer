export interface Festival {
  name: string;
  emoji: string;
  date: string;       // YYYY-MM-DD
  color: string;
  greeting: string;
  couple?: boolean;
  culture?: string;
}

export const FESTIVALS: Festival[] = [
  // ── 2025 Indian & Hindu Festivals ──────────────────────────────────────────
  { name: "New Year's Day",       emoji: "🎆", date: "2025-01-01", color: "#6366F1", greeting: "Happy New Year!",              couple: true,  culture: "Global" },
  { name: "Lohri / Makar Sankranti", emoji: "🪁", date: "2025-01-14", color: "#F97316", greeting: "Kites, sweets & warmth",        couple: true,  culture: "Indian" },
  { name: "Vasant Panchami",      emoji: "🌼", date: "2025-02-02", color: "#FBBF24", greeting: "Welcome Spring & Yellow attire", couple: true,  culture: "Indian" },
  { name: "Valentine's Day",      emoji: "💝", date: "2025-02-14", color: "#E8607A", greeting: "Love is in the air",            couple: true,  culture: "Global" },
  { name: "Maha Shivratri",       emoji: "🕉️", date: "2025-02-26", color: "#8B5CF6", greeting: "A night of divine devotion",    couple: true,  culture: "Indian" },
  { name: "Holi (Festival of Colors)", emoji: "🌈", date: "2025-03-14", color: "#FF6B35", greeting: "Celebrate colour together", couple: true, culture: "Indian" },
  { name: "Ugadi / Gudi Padwa",    emoji: "🚩", date: "2025-03-30", color: "#10B981", greeting: "Happy New Beginnings!",        couple: true,  culture: "Indian" },
  { name: "Ram Navami",           emoji: "🙏", date: "2025-04-06", color: "#F59E0B", greeting: "Auspicious Ram Navami",        couple: false, culture: "Indian" },
  { name: "Hanuman Jayanti",      emoji: "🚩", date: "2025-04-12", color: "#EF4444", greeting: "Strength & devotion",           couple: false, culture: "Indian" },
  { name: "Baisakhi / Vishu / Tamil New Year", emoji: "🌾", date: "2025-04-14", color: "#F59E0B", greeting: "Festive harvests & joy", couple: true, culture: "Indian" },
  { name: "Hariyali Teej",        emoji: "🌿", date: "2025-07-27", color: "#10B981", greeting: "Swing, mehendi & love fast",    couple: true,  culture: "Indian" },
  { name: "Raksha Bandhan",       emoji: "🪢", date: "2025-08-09", color: "#F59E0B", greeting: "Celebrate sacred bond",         couple: true,  culture: "Indian" },
  { name: "Independence Day",     emoji: "🇮🇳", date: "2025-08-15", color: "#FF9933", greeting: "Happy Independence Day",       couple: true,  culture: "Indian" },
  { name: "Janmashtami",          emoji: "🪚", date: "2025-08-16", color: "#3B82F6", greeting: "Divine love of Radha-Krishna",  couple: true,  culture: "Indian" },
  { name: "Hartalika Teej",       emoji: "🌸", date: "2025-08-26", color: "#EC4899", greeting: "Fasting of love & devotion",    couple: true,  culture: "Indian" },
  { name: "Ganesh Chaturthi",     emoji: "🐘", date: "2025-08-27", color: "#F97316", greeting: "Welcome Bappa with Modaks!",    couple: true,  culture: "Indian" },
  { name: "Onam",                 emoji: "🌺", date: "2025-09-05", color: "#F59E0B", greeting: "Grand Pookkalam & feast",      couple: true,  culture: "Indian" },
  { name: "Navratri begins",      emoji: "🪔", date: "2025-09-22", color: "#C084FC", greeting: "Dandiya, Garba & blessings",    couple: true,  culture: "Indian" },
  { name: "Dussehra (Vijayadashami)", emoji: "🏹", date: "2025-10-02", color: "#EF4444", greeting: "Triumph of good & love",      couple: true,  culture: "Indian" },
  { name: "Karwa Chauth",         emoji: "🌕", date: "2025-10-09", color: "#D97706", greeting: "A sacred moonlit fast of love", couple: true, culture: "Indian" },
  { name: "Dhanteras",            emoji: "✨", date: "2025-10-18", color: "#F59E0B", greeting: "Prosperity, gold & lamps",      couple: true,  culture: "Indian" },
  { name: "Diwali (Festival of Lights)", emoji: "🪔", date: "2025-10-20", color: "#F59E0B", greeting: "A glowing Diwali together", couple: true, culture: "Indian" },
  { name: "Govardhan Puja & Bhai Dooj", emoji: "🎁", date: "2025-10-22", color: "#EC4899", greeting: "Love, sweets & blessings", couple: true, culture: "Indian" },
  { name: "Chhath Puja",          emoji: "🌅", date: "2025-10-27", color: "#F97316", greeting: "Sun worship & devotion",        couple: true,  culture: "Indian" },
  { name: "Christmas",            emoji: "🎄", date: "2025-12-25", color: "#22C55E", greeting: "Merry Christmas!",              couple: false, culture: "Global" },
  { name: "New Year's Eve",       emoji: "🥂", date: "2025-12-31", color: "#6366F1", greeting: "Last night of the year",        couple: true,  culture: "Global" },

  // ── 2026 Indian & Hindu Festivals ──────────────────────────────────────────
  { name: "New Year's Day",       emoji: "🎆", date: "2026-01-01", color: "#6366F1", greeting: "Happy New Year! Here's to us", couple: true, culture: "Global" },
  { name: "Makar Sankranti / Pongal", emoji: "🪁", date: "2026-01-14", color: "#F97316", greeting: "Kites & sweet harvest",     couple: true,  culture: "Indian" },
  { name: "Vasant Panchami",      emoji: "🌼", date: "2026-01-23", color: "#FBBF24", greeting: "Yellow blooms & spring joy",   couple: true,  culture: "Indian" },
  { name: "Valentine's Day",      emoji: "💝", date: "2026-02-14", color: "#E8607A", greeting: "Love is in the air",            couple: true,  culture: "Global" },
  { name: "Maha Shivratri",       emoji: "🕉️", date: "2026-02-15", color: "#8B5CF6", greeting: "Night of divine harmony",       couple: true,  culture: "Indian" },
  { name: "Holi (Festival of Colors)", emoji: "🌈", date: "2026-03-03", color: "#FF6B35", greeting: "Colors of love & joy",     couple: true,  culture: "Indian" },
  { name: "Ugadi / Gudi Padwa",    emoji: "🚩", date: "2026-03-19", color: "#10B981", greeting: "Sweet new year together",      couple: true,  culture: "Indian" },
  { name: "Ram Navami",           emoji: "🙏", date: "2026-03-27", color: "#F59E0B", greeting: "Blessings & happiness",        couple: false, culture: "Indian" },
  { name: "Baisakhi / Vishu",     emoji: "🌾", date: "2026-04-14", color: "#F59E0B", greeting: "Harvest celebration",          couple: true,  culture: "Indian" },
  { name: "Hariyali Teej",        emoji: "🌿", date: "2026-08-15", color: "#10B981", greeting: "Green swings & love fast",      couple: true,  culture: "Indian" },
  { name: "Independence Day",     emoji: "🇮🇳", date: "2026-08-15", color: "#FF9933", greeting: "Happy Independence Day",       couple: true,  culture: "Indian" },
  { name: "Raksha Bandhan",       emoji: "🪢", date: "2026-08-28", color: "#F59E0B", greeting: "Celebrate love & protection",  couple: true,  culture: "Indian" },
  { name: "Janmashtami",          emoji: "🪚", date: "2026-09-04", color: "#3B82F6", greeting: "Flute, peacocks & devotion",    couple: true,  culture: "Indian" },
  { name: "Hartalika Teej",       emoji: "🌸", date: "2026-09-14", color: "#EC4899", greeting: "Fasting of love & bond",       couple: true,  culture: "Indian" },
  { name: "Ganesh Chaturthi",     emoji: "🐘", date: "2026-09-14", color: "#F97316", greeting: "Bappa is home!",                couple: true,  culture: "Indian" },
  { name: "Navratri begins",      emoji: "🪔", date: "2026-10-11", color: "#C084FC", greeting: "Garba nights & devotion",       couple: true,  culture: "Indian" },
  { name: "Dussehra",             emoji: "🏹", date: "2026-10-20", color: "#EF4444", greeting: "Triumph of good & love",      couple: true,  culture: "Indian" },
  { name: "Karwa Chauth",         emoji: "🌕", date: "2026-10-29", color: "#D97706", greeting: "Moonlit fast of eternal love",  couple: true,  culture: "Indian" },
  { name: "Dhanteras",            emoji: "✨", date: "2026-11-06", color: "#F59E0B", greeting: "Lamps, gold & prosperity",     couple: true,  culture: "Indian" },
  { name: "Diwali (Festival of Lights)", emoji: "🪔", date: "2026-11-08", color: "#F59E0B", greeting: "A glowing Diwali together", couple: true, culture: "Indian" },
  { name: "Chhath Puja",          emoji: "🌅", date: "2026-11-15", color: "#F97316", greeting: "Sun worship & devotion",        couple: true,  culture: "Indian" },
  { name: "Christmas",            emoji: "🎄", date: "2026-12-25", color: "#22C55E", greeting: "Merry Christmas!",              couple: false, culture: "Global" },
  { name: "New Year's Eve",       emoji: "🥂", date: "2026-12-31", color: "#6366F1", greeting: "Last night of the year",        couple: true,  culture: "Global" },
];

function ordinal(n: number): string {
  if (n <= 0) return '';
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

export interface FestivalResult extends Festival {
  daysAway: number;
  personalGreeting: string;
}

/**
 * Returns the next upcoming festival within 60 days.
 * Pass `togetherSince` (ISO date) to personalize with ordinal count.
 */
export function getNextFestival(togetherSince?: string): FestivalResult | null {
  const now = Date.now();

  for (const f of FESTIVALS) {
    const festMs   = new Date(f.date).getTime();
    const daysAway = Math.ceil((festMs - now) / 86_400_000);
    if (daysAway < -1 || daysAway > 60) continue;

    let personalGreeting = f.greeting;

    if (f.couple && togetherSince) {
      const sinceMs = new Date(togetherSince).getTime();
      if (!isNaN(sinceMs)) {
        const festYear   = new Date(f.date).getFullYear();
        const sinceYear  = new Date(togetherSince).getFullYear();
        const n = festYear - sinceYear + 1;
        if (n >= 1) {
          personalGreeting = `Your ${ordinal(n)} ${f.name} together`;
        }
      }
    }

    return { ...f, daysAway, personalGreeting };
  }
  return null;
}
