import { StyleSheet } from "react-native";
import Svg, { Circle, Defs, Pattern, Rect } from "react-native-svg";

import { useTheme } from "@/ui";

/**
 * Web `.messages` background: a 64px tile with a ring at the centre and a 2px dot offset by 32,32
 * (which lands on the tile corners). Absolutely positioned and non-interactive.
 */
export function ChatPattern() {
  const { colors } = useTheme();
  const c = colors.chatPattern;
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none" width="100%" height="100%">
      <Defs>
        <Pattern id="chat-pattern" x={0} y={0} width={64} height={64} patternUnits="userSpaceOnUse">
          <Circle cx={32} cy={32} r={8.75} stroke={c} strokeWidth={1.5} fill="none" />
          <Circle cx={0} cy={0} r={2.25} fill={c} />
          <Circle cx={64} cy={0} r={2.25} fill={c} />
          <Circle cx={0} cy={64} r={2.25} fill={c} />
          <Circle cx={64} cy={64} r={2.25} fill={c} />
        </Pattern>
      </Defs>
      <Rect x={0} y={0} width="100%" height="100%" fill="url(#chat-pattern)" />
    </Svg>
  );
}
