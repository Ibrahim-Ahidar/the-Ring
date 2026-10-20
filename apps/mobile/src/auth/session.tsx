import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { getSession, onSessionChange, type AppSession } from "@/data";

interface SessionState {
  loading: boolean;
  session: AppSession | null;
}

const SessionContext = createContext<SessionState>({ loading: true, session: null });

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ loading: true, session: null });

  useEffect(() => {
    let active = true;
    // Restore from secure storage, then follow auth changes.
    getSession()
      .then((session) => active && setState({ loading: false, session }))
      .catch(() => active && setState({ loading: false, session: null }));
    const unsubscribe = onSessionChange((session) => setState({ loading: false, session }));
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const value = useMemo(() => state, [state]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  return useContext(SessionContext);
}
