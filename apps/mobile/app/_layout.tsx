import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Slot, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { View } from "react-native";

import { decideRedirect } from "@/auth/gate";
import { SessionProvider, useSession } from "@/auth/session";
import { UpdateGate } from "@/compat/UpdateGate";
import { UpdateNotice } from "@/compat/UpdateNotice";
import { AppIntlProvider } from "@/i18n/provider";
import { PreferencesProvider } from "@/settings/PreferencesProvider";
import { startConnectivityWatch } from "@/net/useOnline";
import { ThemeProvider, useTheme } from "@/ui";

function AuthGate() {
  const { loading, session } = useSession();
  const segments = useSegments();
  const router = useRouter();
  const group = segments[0] as string | undefined;

  useEffect(() => {
    const target = decideRedirect({
      loading,
      signedIn: session !== null,
      group,
    });
    if (target) router.replace(target);
  }, [loading, session, group, router]);

  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Slot />
    </View>
  );
}

function ThemedStatusBar() {
  const { isDark } = useTheme();
  return <StatusBar style={isDark ? "light" : "dark"} />;
}

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient());
  useEffect(() => startConnectivityWatch(), []);
  return (
    <QueryClientProvider client={queryClient}>
      <PreferencesProvider>
        <ThemeProvider>
        <AppIntlProvider>
          <UpdateGate>
            <SessionProvider>
              <ThemedStatusBar />
              <UpdateNotice />
              <AuthGate />
            </SessionProvider>
          </UpdateGate>
        </AppIntlProvider>
        </ThemeProvider>
      </PreferencesProvider>
    </QueryClientProvider>
  );
}
