import * as ExpoHaptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@soulsync/haptics_enabled';
let _enabled: boolean | null = null;

async function isEnabled(): Promise<boolean> {
  if (_enabled !== null) return _enabled;
  try {
    const v = await AsyncStorage.getItem(KEY);
    _enabled = v !== 'false'; // default on
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

export const haptics = {
  light:   () => run(() => ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Light)),
  medium:  () => run(() => ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Medium)),
  heavy:   () => run(() => ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Heavy)),
  success: () => run(() => ExpoHaptics.notificationAsync(ExpoHaptics.NotificationFeedbackType.Success)),
  warning: () => run(() => ExpoHaptics.notificationAsync(ExpoHaptics.NotificationFeedbackType.Warning)),
  error:   () => run(() => ExpoHaptics.notificationAsync(ExpoHaptics.NotificationFeedbackType.Error)),
  select:  () => run(() => ExpoHaptics.selectionAsync()),
};
