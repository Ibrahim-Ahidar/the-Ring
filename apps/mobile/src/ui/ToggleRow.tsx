import type { LucideIcon } from "lucide-react-native";
import { Switch } from "react-native";

import { ListRow } from "./ListRow";
import { useTheme } from "./ThemeProvider";

export interface ToggleRowProps {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
}

/** Settings row with a themed Switch at the end. The whole row toggles. */
export function ToggleRow({ title, subtitle, icon, value, onValueChange, disabled }: ToggleRowProps) {
  const { colors } = useTheme();
  return (
    <ListRow
      title={title}
      subtitle={subtitle}
      icon={icon}
      disabled={disabled}
      onPress={() => onValueChange(!value)}
      accessibilityLabel={title}
      trailing={
        <Switch
          value={value}
          onValueChange={onValueChange}
          disabled={disabled}
          accessibilityLabel={title}
          trackColor={{ false: colors.borderStrong, true: colors.accent }}
          thumbColor={colors.accentContrast === "#ffffff" ? "#ffffff" : colors.text}
        />
      }
    />
  );
}
