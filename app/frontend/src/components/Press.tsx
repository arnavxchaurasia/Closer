import * as Haptics from 'expo-haptics';
import { Pressable, PressableProps, StyleProp, ViewStyle } from 'react-native';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

type HapticStyle = 'light' | 'medium' | 'heavy' | 'select' | 'none';

interface PressProps extends Omit<PressableProps, 'style'> {
  haptic?: HapticStyle;
  scale?: number;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

function triggerHaptic(haptic: HapticStyle) {
  if (haptic === 'light')  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  if (haptic === 'medium') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  if (haptic === 'heavy')  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
  if (haptic === 'select') Haptics.selectionAsync().catch(() => {});
}

export function Press({ haptic = 'light', scale = 0.96, onPress, style, children, disabled, ...rest }: PressProps) {
  const sv = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: sv.value }],
  }));

  const handlePressIn = () => {
    sv.value = withSpring(scale, { mass: 0.3, stiffness: 400, damping: 30 });
    if (!disabled && haptic !== 'none') runOnJS(triggerHaptic)(haptic);
  };

  const handlePressOut = () => {
    sv.value = withSpring(1, { mass: 0.3, stiffness: 300, damping: 22, energyThreshold: 0.001 });
  };

  return (
    <Pressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      {...rest}
    >
      <Animated.View style={[style, animStyle]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}
