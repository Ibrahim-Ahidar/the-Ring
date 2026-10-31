import { isE2eeEnabled } from "@pulse/core";
import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { getVodozemac, runVodozemacSelfTest, type SelfTestStep } from "../../modules/vodozemac/src";
import { AppHeader, Button, Screen, Text, useTheme } from "@/ui";

/**
 * Dev-only screen (flag e2ee + __DEV__): runs the native vodozemac self-test and shows pass/fail.
 * Reach it by opening `thering://dev-e2ee` or via the settings row that only shows in dev builds.
 */
export default function DevE2eeScreen() {
  const router = useRouter();
  const { spacing } = useTheme();
  const [steps, setSteps] = useState<SelfTestStep[] | null>(null);
  const [busy, setBusy] = useState(false);
  const available = __DEV__ && isE2eeEnabled();

  async function run() {
    setBusy(true);
    try {
      setSteps(await runVodozemacSelfTest(getVodozemac()));
    } catch (e) {
      setSteps([{ name: "load", ok: false, detail: e instanceof Error ? e.message : String(e) }]);
    }
    setBusy(false);
  }

  const allOk = steps !== null && steps.length > 0 && steps.every((s) => s.ok);
  return (
    <Screen edges={["start", "end", "bottom"]} background="panel" scroll contentStyle={{ padding: spacing.s16 }}>
      <AppHeader title="E2EE self-test (dev)" onBack={() => router.back()} backLabel="Back" />
      {!available ? (
        <Text>Only available in dev builds with EXPO_PUBLIC_PULSE_E2EE=1.</Text>
      ) : (
        <View style={{ gap: spacing.s12 }}>
          <Button title={busy ? "Running..." : "Run Olm / Megolm round trip"} onPress={run} disabled={busy} />
          {steps ? <Text>{allOk ? "PASS" : "FAIL"}</Text> : null}
          {steps?.map((s) => (
            <Text key={s.name}>{`${s.ok ? "PASS" : "FAIL"} ${s.name}${s.detail ? `: ${s.detail}` : ""}`}</Text>
          ))}
        </View>
      )}
    </Screen>
  );
}
