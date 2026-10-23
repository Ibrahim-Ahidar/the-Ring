import { memo, useState } from "react";
import { StyleSheet, View, type LayoutChangeEvent } from "react-native";
import Svg, { Circle } from "react-native-svg";

import { useTheme } from "@/ui";

const TILE = 64;
const MAX_TILES = 4000;

/** Splits "rgba(r, g, b, a)" into an opaque colour and its alpha (the web token is one rgba value). */
export function splitRgba(value: string): { color: string; opacity: number } {
  const m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(value);
  if (!m) return { color: value, opacity: 1 };
  return { color: `rgb(${m[1]}, ${m[2]}, ${m[3]})`, opacity: m[4] === undefined ? 1 : Number(m[4]) };
}

/**
 * Web `.messages` background: a 64px tile with a ring at the centre and a 2px dot offset by 32,32
 * (which lands on the tile corners). Drawn as plain circles (no <Pattern>: Android renders rgba
 * patterns too bright and drops the corner dots). Absolutely positioned and non-interactive.
 */
function ChatPatternView() {
  const { colors } = useTheme();
  const { color, opacity } = splitRgba(colors.chatPattern);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((prev) => (prev.w === width && prev.h === height ? prev : { w: width, h: height }));
  };
  const cols = Math.ceil(size.w / TILE);
  const rows = Math.ceil(size.h / TILE);
  const shapes = [];
  if (cols * rows <= MAX_TILES) {
    for (let r = 0; r <= rows; r++) {
      for (let c = 0; c <= cols; c++) {
        const x = c * TILE;
        const y = r * TILE;
        // Dots at the tile corners (x, y); rings at the tile centres.
        shapes.push(<Circle key={`d${r}-${c}`} cx={x} cy={y} r={2.25} fill={color} fillOpacity={opacity} />);
        if (r < rows && c < cols) {
          shapes.push(
            <Circle
              key={`r${r}-${c}`}
              cx={x + TILE / 2}
              cy={y + TILE / 2}
              r={8.75}
              stroke={color}
              strokeOpacity={opacity}
              strokeWidth={1.5}
              fill="none"
            />,
          );
        }
      }
    }
  }
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" onLayout={onLayout}>
      {size.w > 0 ? (
        <Svg width={size.w} height={size.h} pointerEvents="none">
          {shapes}
        </Svg>
      ) : null}
    </View>
  );
}

export const ChatPattern = memo(ChatPatternView);
