import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, { Polygon, Line, Circle, Text as SvgText } from "react-native-svg";
import { useTheme } from "@/contexts/ThemeContext";

interface RadarProps {
  rsi?: number;
  macd?: number;
  ema20?: number;
  ema50?: number;
  confidence: number;
  strength: number;
  action: "BUY" | "SELL" | "HOLD";
}

const AXES = [
  { key: "rsi", label: "RSI" },
  { key: "momentum", label: "Momentum" },
  { key: "trend", label: "Trend" },
  { key: "confidence", label: "Confidenza" },
  { key: "strength", label: "Forza" },
  { key: "volatility", label: "Volatilita" },
];

function normalizeValues(props: RadarProps): number[] {
  const rsiScore = props.rsi != null ? Math.min(100, Math.max(0, props.rsi)) / 100 : 0.5;

  const macdScore = props.macd != null
    ? 0.5 + Math.min(0.5, Math.max(-0.5, props.macd * 100)) 
    : 0.5;

  const trendScore = (props.ema20 != null && props.ema50 != null)
    ? (props.ema20 > props.ema50 ? 0.7 + Math.min(0.3, Math.abs(props.ema20 - props.ema50) / props.ema50 * 50) : 0.3 - Math.min(0.3, Math.abs(props.ema50 - props.ema20) / props.ema50 * 50))
    : 0.5;

  const confScore = props.confidence / 100;
  const strengthScore = props.strength / 100;

  const volScore = props.rsi != null
    ? (Math.abs(props.rsi - 50) / 50) * 0.6 + 0.2
    : 0.5;

  return [rsiScore, macdScore, trendScore, confScore, strengthScore, volScore];
}

export default function TechRadarChart(props: RadarProps) {
  const { colors: C } = useTheme();
  const values = normalizeValues(props);
  
  const size = 200;
  const cx = size / 2;
  const cy = size / 2;
  const maxR = 75;
  const levels = 4;

  const angleStep = (2 * Math.PI) / AXES.length;
  const startAngle = -Math.PI / 2;

  const getPoint = (index: number, value: number) => {
    const angle = startAngle + index * angleStep;
    return {
      x: cx + maxR * value * Math.cos(angle),
      y: cy + maxR * value * Math.sin(angle),
    };
  };

  const gridPolygons = Array.from({ length: levels }, (_, lvl) => {
    const r = ((lvl + 1) / levels);
    const points = AXES.map((_, i) => {
      const p = getPoint(i, r);
      return `${p.x},${p.y}`;
    }).join(" ");
    return points;
  });

  const dataPoints = values.map((v, i) => {
    const p = getPoint(i, v);
    return `${p.x},${p.y}`;
  }).join(" ");

  const fillColor = props.action === "BUY" ? C.buy : props.action === "SELL" ? C.sell : C.hold;

  return (
    <View style={st.container}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {gridPolygons.map((pts, i) => (
          <Polygon
            key={i}
            points={pts}
            fill="none"
            stroke={C.border}
            strokeWidth={0.5}
            opacity={0.5}
          />
        ))}
        {AXES.map((_, i) => {
          const p = getPoint(i, 1);
          return (
            <Line
              key={i}
              x1={cx} y1={cy}
              x2={p.x} y2={p.y}
              stroke={C.border}
              strokeWidth={0.5}
              opacity={0.4}
            />
          );
        })}
        <Polygon
          points={dataPoints}
          fill={fillColor}
          fillOpacity={0.15}
          stroke={fillColor}
          strokeWidth={1.5}
        />
        {values.map((v, i) => {
          const p = getPoint(i, v);
          return (
            <Circle
              key={i}
              cx={p.x} cy={p.y}
              r={3}
              fill={fillColor}
              stroke={C.backgroundCard}
              strokeWidth={1.5}
            />
          );
        })}
        {AXES.map((axis, i) => {
          const p = getPoint(i, 1.25);
          return (
            <SvgText
              key={i}
              x={p.x}
              y={p.y}
              textAnchor="middle"
              alignmentBaseline="middle"
              fontSize={9}
              fontWeight="600"
              fill={C.textSecondary}
            >
              {axis.label}
            </SvgText>
          );
        })}
      </Svg>
      <View style={st.valuesRow}>
        {AXES.map((axis, i) => (
          <View key={axis.key} style={st.valueItem}>
            <View style={[st.valueDot, { backgroundColor: fillColor, opacity: values[i] }]} />
            <Text style={[st.valueLabel, { color: C.textMuted }]}>{axis.label}</Text>
            <Text style={[st.valueNum, { color: values[i] >= 0.6 ? fillColor : C.textSecondary }]}>
              {Math.round(values[i] * 100)}%
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  container: { alignItems: "center", gap: 12 },
  valuesRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8 },
  valueItem: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6 },
  valueDot: { width: 6, height: 6, borderRadius: 3 },
  valueLabel: { fontSize: 9, fontFamily: "Inter_400Regular" },
  valueNum: { fontSize: 10, fontFamily: "Inter_700Bold" },
});
