import React, { useEffect } from "react";
import { View, StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from "react-native-reanimated";
import Colors from "@/constants/colors";

function ShimmerBlock({ width, height, borderRadius = 6, style }: {
  width: number | string;
  height: number;
  borderRadius?: number;
  style?: any;
}) {
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(0.7, { duration: 900, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          width: width as any,
          height,
          borderRadius,
          backgroundColor: Colors.dark.backgroundElevated,
        },
        style,
        animStyle,
      ]}
    />
  );
}

export function SignalSkeleton() {
  return (
    <View style={[skStyles.card, { backgroundColor: Colors.dark.backgroundCard, borderColor: Colors.dark.border }]}>
      <View style={skStyles.row}>
        <View style={{ flex: 1, gap: 8 }}>
          <View style={skStyles.row}>
            <ShimmerBlock width={90} height={18} />
            <ShimmerBlock width={60} height={24} borderRadius={4} />
            <ShimmerBlock width={30} height={16} borderRadius={4} />
          </View>
          <ShimmerBlock width={60} height={12} />
        </View>
        <ShimmerBlock width={70} height={32} borderRadius={10} />
      </View>
      <View style={{ gap: 4, marginTop: 10 }}>
        <View style={skStyles.row}>
          <ShimmerBlock width={80} height={10} />
          <ShimmerBlock width={30} height={10} />
        </View>
        <ShimmerBlock width="100%" height={4} borderRadius={2} />
      </View>
      <View style={[skStyles.priceRow, { backgroundColor: Colors.dark.backgroundElevated, marginTop: 10 }]}>
        <ShimmerBlock width={60} height={28} />
        <ShimmerBlock width={60} height={28} />
        <ShimmerBlock width={60} height={28} />
      </View>
      <View style={[skStyles.row, { marginTop: 10 }]}>
        <ShimmerBlock width="70%" height={14} />
        <ShimmerBlock width={50} height={14} />
      </View>
    </View>
  );
}

export function NewsSkeleton() {
  return (
    <View style={[skStyles.card, { backgroundColor: Colors.dark.backgroundCard, borderColor: Colors.dark.border }]}>
      <View style={skStyles.row}>
        <View style={[skStyles.row, { flex: 1, gap: 6 }]}>
          <ShimmerBlock width={7} height={7} borderRadius={4} />
          <ShimmerBlock width={70} height={12} />
          <ShimmerBlock width={40} height={10} />
        </View>
        <ShimmerBlock width={48} height={20} borderRadius={6} />
      </View>
      <ShimmerBlock width="95%" height={16} style={{ marginTop: 10 }} />
      <ShimmerBlock width="70%" height={16} style={{ marginTop: 4 }} />
      <ShimmerBlock width="90%" height={13} style={{ marginTop: 8 }} />
      <View style={[skStyles.row, { marginTop: 10, gap: 6 }]}>
        <ShimmerBlock width={36} height={20} borderRadius={6} />
        <ShimmerBlock width={36} height={20} borderRadius={6} />
      </View>
    </View>
  );
}

export function CalendarSkeleton() {
  return (
    <View style={[skStyles.card, { backgroundColor: Colors.dark.backgroundCard, borderColor: Colors.dark.border, borderLeftWidth: 3, borderLeftColor: Colors.dark.textMuted }]}>
      <View style={skStyles.row}>
        <View style={{ alignItems: "center", gap: 4, minWidth: 52 }}>
          <ShimmerBlock width={48} height={24} borderRadius={6} />
          <ShimmerBlock width={30} height={10} />
        </View>
        <View style={{ flex: 1, gap: 6 }}>
          <ShimmerBlock width="90%" height={16} />
          <View style={[skStyles.row, { gap: 4 }]}>
            <ShimmerBlock width={30} height={16} borderRadius={4} />
            <ShimmerBlock width={30} height={16} borderRadius={4} />
          </View>
        </View>
        <ShimmerBlock width={50} height={22} borderRadius={6} />
      </View>
    </View>
  );
}

export function AlertSkeleton() {
  return (
    <View style={[skStyles.card, { backgroundColor: Colors.dark.backgroundCard, borderColor: Colors.dark.border, flexDirection: "row", gap: 12 }]}>
      <ShimmerBlock width={44} height={44} borderRadius={12} />
      <View style={{ flex: 1, gap: 6 }}>
        <View style={skStyles.row}>
          <ShimmerBlock width="70%" height={14} />
          <ShimmerBlock width={40} height={10} />
        </View>
        <ShimmerBlock width="90%" height={12} />
        <ShimmerBlock width={50} height={18} borderRadius={6} style={{ marginTop: 2 }} />
      </View>
    </View>
  );
}

const skStyles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
    marginHorizontal: 16,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  priceRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
});
