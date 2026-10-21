import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Slot, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";

import { decideRedirect } from "@/auth/gate";
import { SessionProvider, useSession } from "@/auth/session";
import { UpdateGate } from "@/compat/UpdateGate";
import { UpdateNotice } from "@/compat/UpdateNotice";
import { AppIntlProvider } from "@/i18n/provider";
import { PreferencesProvider } from "@/settings/PreferencesProvider";
import { startConnectivityWatch } from "@/net/useOnline";

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

  return <Slot />;
}

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient());
  useEffect(() => startConnectivityWatch(), []);
  return (
    <QueryClientProvider client={queryClient}>
      <PreferencesProvider>
        <AppIntlProvider>
          <UpdateGate>
            <SessionProvider>
              <StatusBar style="auto" />
              <UpdateNotice />
              <AuthGate />
            </SessionProvider>
          </UpdateGate>
        </AppIntlProvider>
      </PreferencesProvider>
    </QueryClientProvider>
  );
}
