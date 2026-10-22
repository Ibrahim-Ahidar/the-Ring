import { useQuery } from "@tanstack/react-query";

import { currentDeviceId, getEmailState, listMfaFactors, listSessions, unwrap } from "@/data";

export function useSessions() {
  return useQuery({
    queryKey: ["security", "sessions"],
    queryFn: async () => ({ sessions: unwrap(await listSessions()), currentId: await currentDeviceId() }),
  });
}

export function useMfaFactors() {
  return useQuery({ queryKey: ["security", "mfa"], queryFn: async () => unwrap(await listMfaFactors()) });
}

export function useEmailState() {
  return useQuery({ queryKey: ["security", "email"], queryFn: getEmailState });
}
