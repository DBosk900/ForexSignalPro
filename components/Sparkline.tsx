import React, { useMemo } from "react";
import { View } from "react-native";
import Svg, { Polyline, Polygon, Defs, LinearGradient, Stop } from "react-native-svg";
import { useTheme } from "@/contexts/ThemeContext";

interface SparklineProps {
  width?: number;
  height?: number;
  action: "BUY" | "SELL" | "HOLD";
  strength?: number;
  seed?: string;
  data?: number[];
}

function seededRandom(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(31, h) + seed.charCodeAt(i) | 0;
  }
  return function() {
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
    h = Math.imul(h ^ (h >>> 13), 0x45d9f3b);
    h = (h ^ (h >>> 16)) >>> 0;
    return h / 4294967296;
  };
}

export default function Sparkline({ width = 80, height = 30, action, strength = 70, seed = "default", data }: SparklineProps) {
  const { colors } = useTheme();
  const color = action === "BUY" ? colors.buy : action === "SELL" ? colors.sell : colors.hold;
  const padding = 2;
  const gradId = `spark-${seed}-${action}`;

  const { linePoints, areaPoints } = useMemo(() => {
    let values: number[];

    if (data && data.length >= 2) {
      values = data;
    } else {
      const rng = seededRandom(seed + action);
      values = [];
      let val = 50;
      const trend = action === "BUY" ? 0.3 : action === "SELL" ? -0.3 : 0;
      const volatility = (100 - strength) / 100 * 3 + 0.5;
      for (let i = 0; i < 20; i++) {
        val += trend + (rng() - 0.5) * volatility;
        val = Math.max(10, Math.min(90, val));
        values.push(val);
      }
    }

    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const range = maxVal - minVal || 1;
    const points = values.length;

    const coords = values.map((v, i) => {
      const x = padding + (i / (points - 1)) * (width - padding * 2);
      const y = padding + (1 - (v - minVal) / range) * (height - padding * 2);
      return { x, y };
    });

    const line = coords.map(c => `${c.x},${c.y}`).join(" ");
    const area = [
      ...coords.map(c => `${c.x},${c.y}`),
      `${coords[coords.length - 1].x},${height}`,
      `${coords[0].x},${height}`,
    ].join(" ");

    return { linePoints: line, areaPoints: area };
  }, [width, height, action, strength, seed, data]);

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity="0.25" />
            <Stop offset="1" stopColor={color} stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <Polygon
          points={areaPoints}
          fill={`url(#${gradId})`}
        />
        <Polyline
          points={linePoints}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}
