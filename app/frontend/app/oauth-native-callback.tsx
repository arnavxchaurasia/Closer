import { Redirect } from 'expo-router';

export default function OAuthNativeCallback() {
  return <Redirect href="/(app)" />;
}
