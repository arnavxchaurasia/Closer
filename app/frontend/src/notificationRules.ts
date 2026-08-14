/**
 * Client-side notification rate-limiting and debounce rules.
 *
 * Rules:
 *  - Availability change: 5-min debounce (only fire after user stops toggling).
 *    Max 3 per day. Quiet hours 22:00–08:00 (local).
 *  - Nudge ("thinking of you"): max 2 per day, 2-hour cooldown between sends.
 *  - Content (journal / letter): batch — only 1 notification per 10-min window.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  availLastFired: '@soulsync/notif/avail_last_fired',
  availCount:     '@soulsync/notif/avail_count_today',
  availCountDate: '@soulsync/notif/avail_count_date',
  nudgeLastSent:  '@soulsync/notif/nudge_last_sent',
  nudgeCount:     '@soulsync/notif/nudge_count_today',
  nudgeCountDate: '@soulsync/notif/nudge_count_date',
  contentLast:    '@soulsync/notif/content_last',
};

const AVAIL_DEBOUNCE_MS  = 5 * 60 * 1000;   // 5 minutes
const AVAIL_DAILY_MAX    = 3;
const NUDGE_COOLDOWN_MS  = 2 * 60 * 60 * 1000; // 2 hours
const NUDGE_DAILY_MAX    = 2;
const CONTENT_WINDOW_MS  = 10 * 60 * 1000;  // 10 minutes
const QUIET_START        = 22; // 10pm
const QUIET_END          = 8;  // 8am

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function isQuietHours(): boolean {
  const h = new Date().getHours();
  return h >= QUIET_START || h < QUIET_END;
}

async function getDailyCount(countKey: string, dateKey: string): Promise<number> {
  const [count, date] = await Promise.all([
    AsyncStorage.getItem(countKey),
    AsyncStorage.getItem(dateKey),
  ]);
  if (date !== todayStr()) return 0; // reset on new day
  return parseInt(count ?? '0', 10);
}

async function incrementDailyCount(countKey: string, dateKey: string) {
  const cur = await getDailyCount(countKey, dateKey);
  await Promise.all([
    AsyncStorage.setItem(countKey, String(cur + 1)),
    AsyncStorage.setItem(dateKey, todayStr()),
  ]);
}

// ─── Availability debounce ────────────────────────────────────────────────────
let availTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Call this every time the user changes their availability status.
 * The callback only fires once, 5 min after the LAST change.
 * Returns false if daily limit reached or it's quiet hours.
 */
export async function scheduleAvailabilityNotification(
  onFire: () => void,
): Promise<{ scheduled: boolean; reason?: string }> {
  if (isQuietHours()) {
    return { scheduled: false, reason: 'quiet_hours' };
  }
  const count = await getDailyCount(KEYS.availCount, KEYS.availCountDate);
  if (count >= AVAIL_DAILY_MAX) {
    return { scheduled: false, reason: 'daily_limit' };
  }

  // Cancel any pending debounce
  if (availTimer) clearTimeout(availTimer);

  availTimer = setTimeout(async () => {
    availTimer = null;
    await incrementDailyCount(KEYS.availCount, KEYS.availCountDate);
    await AsyncStorage.setItem(KEYS.availLastFired, String(Date.now()));
    onFire();
  }, AVAIL_DEBOUNCE_MS);

  return { scheduled: true };
}

export function cancelAvailabilityDebounce() {
  if (availTimer) { clearTimeout(availTimer); availTimer = null; }
}

// ─── Nudge rate limiting ──────────────────────────────────────────────────────
export async function canSendNudge(): Promise<{ allowed: boolean; reason?: string; remainingToday?: number }> {
  const [lastStr, count] = await Promise.all([
    AsyncStorage.getItem(KEYS.nudgeLastSent),
    getDailyCount(KEYS.nudgeCount, KEYS.nudgeCountDate),
  ]);

  if (count >= NUDGE_DAILY_MAX) {
    return { allowed: false, reason: 'daily_limit', remainingToday: 0 };
  }

  if (lastStr) {
    const elapsed = Date.now() - parseInt(lastStr, 10);
    if (elapsed < NUDGE_COOLDOWN_MS) {
      const minutesLeft = Math.ceil((NUDGE_COOLDOWN_MS - elapsed) / 60000);
      return { allowed: false, reason: 'cooldown', remainingToday: NUDGE_DAILY_MAX - count };
    }
  }

  return { allowed: true, remainingToday: NUDGE_DAILY_MAX - count };
}

export async function recordNudgeSent() {
  await Promise.all([
    AsyncStorage.setItem(KEYS.nudgeLastSent, String(Date.now())),
    incrementDailyCount(KEYS.nudgeCount, KEYS.nudgeCountDate),
  ]);
}

export async function getNudgeStatus(): Promise<{ remaining: number; cooldownMinsLeft: number }> {
  const [lastStr, count] = await Promise.all([
    AsyncStorage.getItem(KEYS.nudgeLastSent),
    getDailyCount(KEYS.nudgeCount, KEYS.nudgeCountDate),
  ]);
  const remaining = Math.max(0, NUDGE_DAILY_MAX - count);
  let cooldownMinsLeft = 0;
  if (lastStr) {
    const elapsed = Date.now() - parseInt(lastStr, 10);
    if (elapsed < NUDGE_COOLDOWN_MS) {
      cooldownMinsLeft = Math.ceil((NUDGE_COOLDOWN_MS - elapsed) / 60000);
    }
  }
  return { remaining, cooldownMinsLeft };
}

// ─── Content batching ─────────────────────────────────────────────────────────
/**
 * Returns true if a content notification should fire now.
 * Suppresses if one already fired within the last 10 minutes.
 */
export async function shouldFireContentNotification(): Promise<boolean> {
  const lastStr = await AsyncStorage.getItem(KEYS.contentLast);
  if (lastStr && Date.now() - parseInt(lastStr, 10) < CONTENT_WINDOW_MS) {
    return false;
  }
  await AsyncStorage.setItem(KEYS.contentLast, String(Date.now()));
  return true;
}
