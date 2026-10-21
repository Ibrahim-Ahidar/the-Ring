import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Slot, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";

import { decideRedirect } from "@/auth/gate";
import { SessionProvider, useSession } from "@/auth/session";
import { AppIntlProvider } from "@/i18n/provider";
import { startConnectivityWatch } from "@/net/useOnline";

function AuthGate() {
  const { loading, session } = useSession();
  const segments = useSegments();
  const router = useRouter();
  const group = segments[0] as string | undefined;

  useEffect(() => {
    const target = decideRedirect({ loading, signedIn: session !== null, group });
    if (target) router.replace(target);
  }, [loading, session, group, router]);

  return <Slot />;
}

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient());
  useEffect(() => startConnectivityWatch(), []);
  return (
    <QueryClientProvider client={queryClient}>
      <AppIntlProvider>
        <SessionProvider>
          <StatusBar style="auto" />
          <AuthGate />
        </SessionProvider>
      </AppIntlProvider>
    </QueryClientProvider>
  );
}
