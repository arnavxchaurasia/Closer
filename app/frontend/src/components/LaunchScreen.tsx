import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

const NUM_PARTICLES = 12;

function useAnim(initial: number) {
  return useRef(new Animated.Value(initial)).current;
}

function spring(anim: Animated.Value, to: number, config?: object) {
  return Animated.spring(anim, { toValue: to, useNativeDriver: true, damping: 14, stiffness: 160, mass: 0.9, ...config });
}

function fade(anim: Animated.Value, to: number, duration: number, delay = 0, easing = Easing.out(Easing.cubic)) {
  return Animated.timing(anim, { toValue: to, duration, delay, easing, useNativeDriver: true });
}

function Particle({ index, total }: { index: number; total: number }) {
  const angle = (index / total) * Math.PI * 2;
  const dist = 60 + (index % 3) * 28;
  const tx = useAnim(0);
  const ty = useAnim(0);
  const opacity = useAnim(0);
  const scale = useAnim(0.3);

  useEffect(() => {
    const delay = 180 + index * 35;
    Animated.parallel([
      fade(opacity, 1, 220, delay),
      spring(scale, 1, { delay }),
      Animated.timing(tx, { toValue: Math.cos(angle) * dist, duration: 600, delay, easing: Easing.out(Easing.exp), useNativeDriver: true }),
      Animated.timing(ty, { toValue: Math.sin(angle) * dist, duration: 600, delay, easing: Easing.out(Easing.exp), useNativeDriver: true }),
    ]).start(() => {
      Animated.timing(opacity, { toValue: 0, duration: 400, delay: 300, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start();
    });
  }, []);

  const size = 4 + (index % 3) * 2;
  const colors = ['#E8607A', '#C44DFF', '#FF9EB5', '#FF6B9D'];
  return (
    <Animated.View style={{
      position: 'absolute',
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: colors[index % colors.length],
      opacity,
      transform: [{ translateX: tx }, { translateY: ty }, { scale }],
    }} />
  );
}

function PulseRing({ delay }: { delay: number }) {
  const scale = useAnim(0.6);
  const opacity = useAnim(0);
  useEffect(() => {
    const loop = Animated.loop(
      Animated.parallel([
        Animated.timing(scale, { toValue: 2.4, duration: 1800, delay, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.sequence([
          Animated.timing(opacity, { toValue: 0.25, duration: 200, delay, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0, duration: 1600, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        ]),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);
  return (
    <Animated.View style={{
      position: 'absolute',
      width: 90, height: 90, borderRadius: 45,
      borderWidth: 1.5, borderColor: '#E8607A',
      opacity, transform: [{ scale }],
    }} />
  );
}

export function LaunchScreen() {
  const logoScale   = useAnim(0.5);
  const logoOpacity = useAnim(0);
  const logoPulse   = useAnim(1);
  const titleOpacity = useAnim(0);
  const titleY       = useAnim(16);
  const tagOpacity   = useAnim(0);
  const tagY         = useAnim(10);
  const glowOpacity  = useAnim(0);

  useEffect(() => {
    // Glow behind logo
    fade(glowOpacity, 0.6, 600, 100).start();

    // Logo pop
    Animated.parallel([
      spring(logoScale, 1, { delay: 0 }),
      fade(logoOpacity, 1, 250, 0),
    ]).start(() => {
      // Gentle heartbeat pulse loop
      Animated.loop(
        Animated.sequence([
          Animated.timing(logoPulse, { toValue: 1.07, duration: 700, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(logoPulse, { toValue: 1,    duration: 700, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.delay(800),
        ])
      ).start();
    });

    // Title
    Animated.parallel([
      fade(titleOpacity, 1, 420, 320),
      Animated.timing(titleY, { toValue: 0, duration: 420, delay: 320, easing: Easing.out(Easing.exp), useNativeDriver: true }),
    ]).start();

    // Tagline
    Animated.parallel([
      fade(tagOpacity, 1, 380, 560),
      Animated.timing(tagY, { toValue: 0, duration: 380, delay: 560, easing: Easing.out(Easing.exp), useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <LinearGradient colors={['#08050F', '#140A20', '#0F0818']} style={StyleSheet.absoluteFill}>
      <View style={s.center}>
        {/* Glow */}
        <Animated.View style={[s.glow, { opacity: glowOpacity }]} />

        {/* Pulse rings */}
        <PulseRing delay={400} />
        <PulseRing delay={900} />

        {/* Heart + particles */}
        <View style={s.logoWrap}>
          {Array.from({ length: NUM_PARTICLES }).map((_, i) => (
            <Particle key={i} index={i} total={NUM_PARTICLES} />
          ))}
          <Animated.View style={{ opacity: logoOpacity, transform: [{ scale: Animated.multiply(logoScale, logoPulse) }] }}>
            <Text style={s.heart}>💗</Text>
          </Animated.View>
        </View>

        {/* Brand name */}
        <Animated.Text style={[s.brand, { opacity: titleOpacity, transform: [{ translateY: titleY }] }]}>
          OurSpace
        </Animated.Text>

        {/* Tagline */}
        <Animated.Text style={[s.tag, { opacity: tagOpacity, transform: [{ translateY: tagY }] }]}>
          Your private space for two
        </Animated.Text>
      </View>

      {/* Shimmer bar at bottom */}
      <Shimmer />
    </LinearGradient>
  );
}

function Shimmer() {
  const x = useAnim(-220);
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.delay(700),
        Animated.timing(x, { toValue: 220, duration: 1100, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
        Animated.timing(x, { toValue: -220, duration: 0, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <View style={s.shimmerTrack}>
      <Animated.View style={[s.shimmerBar, { transform: [{ translateX: x }] }]} />
    </View>
  );
}

const s = StyleSheet.create({
  center:      { flex: 1, alignItems: 'center', justifyContent: 'center' },
  glow:        { position: 'absolute', width: 220, height: 220, borderRadius: 110, backgroundColor: '#7B2D8B', top: '38%', marginTop: -110 },
  logoWrap:    { alignItems: 'center', justifyContent: 'center', marginBottom: 28, width: 120, height: 120 },
  heart:       { fontSize: 72, lineHeight: 82 },
  brand:       { fontSize: 38, fontWeight: '900', color: '#fff', letterSpacing: -1.5, marginBottom: 10 },
  tag:         { fontSize: 15, color: 'rgba(255,255,255,0.45)', fontWeight: '500', letterSpacing: 0.5 },
  shimmerTrack:{ height: 2, width: 160, borderRadius: 1, backgroundColor: 'rgba(232,96,122,0.15)', overflow: 'hidden', marginBottom: 56, alignSelf: 'center' },
  shimmerBar:  { height: 2, width: 80, borderRadius: 1, backgroundColor: 'rgba(232,96,122,0.8)' },
});
