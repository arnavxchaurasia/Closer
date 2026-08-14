import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function registerForPushNotifications(): Promise<string | null> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') return null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'OurSpace',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#E8607A',
    });
  }

  try {
    const token = await Notifications.getExpoPushTokenAsync();
    return token.data;
  } catch {
    return null;
  }
}

export async function scheduleLocalReminder(
  title: string,
  body: string,
  trigger: Notifications.NotificationTriggerInput,
) {
  return Notifications.scheduleNotificationAsync({
    content: { title, body, sound: true, data: { source: 'soulsync' } },
    trigger,
  });
}

export async function scheduleDailyCheckIn() {
  await Notifications.cancelAllScheduledNotificationsAsync();
  await scheduleLocalReminder(
    '💕 Daily check-in',
    'How are you feeling today? Let your partner know.',
    { hour: 20, minute: 0, repeats: true } as any,
  );
}
