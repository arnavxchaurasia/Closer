import * as ExpoHaptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@soulsync/haptics_enabled';
let _enabled: boolean | null = null;

async function isEnabled(): Promise<boolean> {
  if (_enabled !== null) return _enabled;
  try {
    const v = await AsyncStorage.getItem(KEY);
    _enabled = v !== 'false';
  } catch {
    _enabled = true;
  }
  return _enabled;
}

export async function setHapticsEnabled(val: boolean) {
  _enabled = val;
  await AsyncStorage.setItem(KEY, val ? 'true' : 'false');
}

export async function getHapticsEnabled(): Promise<boolean> {
  return isEnabled();
}

async function run(fn: () => Promise<void>) {
  if (await isEnabled()) fn().catch(() => {});
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export const haptics = {
  // Standard impact styles
  light:   () => run(() => ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Light)),
  medium:  () => run(() => ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Medium)),
  heavy:   () => run(() => ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Heavy)),
  
  // Notification styles
  success: () => run(() => ExpoHaptics.notificationAsync(ExpoHaptics.NotificationFeedbackType.Success)),
  warning: () => run(() => ExpoHaptics.notificationAsync(ExpoHaptics.NotificationFeedbackType.Warning)),
  error:   () => run(() => ExpoHaptics.notificationAsync(ExpoHaptics.NotificationFeedbackType.Error)),
  select:  () => run(() => ExpoHaptics.selectionAsync()),

  // Specialized tactile patterns
  pop: () => run(() => ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Light)),
  
  // Heartbeat pattern: lub-dub pulse for sending love / "Thinking of you" 💗
  heartbeat: () => run(async () => {
    await ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Medium);
    await sleep(90);
    await ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Heavy);
  }),

  // Celebration pattern: festive multi-pulse for adding calendar events or completing milestones 🎉
  celebrate: () => run(async () => {
    await ExpoHaptics.notificationAsync(ExpoHaptics.NotificationFeedbackType.Success);
    await sleep(120);
    await ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Medium);
  }),

  // Destructive pattern: warning + rigid impact for deleting items 🗑️
  delete: () => run(async () => {
    await ExpoHaptics.notificationAsync(ExpoHaptics.NotificationFeedbackType.Warning);
    await sleep(80);
    await ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Heavy);
  }),
};
