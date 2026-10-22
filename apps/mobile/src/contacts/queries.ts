import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  addContact,
  clearAllRecents,
  clearRecent,
  getMyProfile,
  getUserProfile,
  listContacts,
  listRecents,
  removeContact,
  changeMyUsername,
  removeMyAvatar,
  saveMyProfile,
  searchUser,
  startDirectChat,
  uploadMyAvatar,
  unwrap,
} from "@/data";

export function useContacts() {
  return useQuery({ queryKey: ["contacts"], queryFn: async () => unwrap(await listContacts()) });
}

export function useUserSearch(username: string) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: ["user-search", username],
    enabled: username.length > 0,
    queryFn: async () => {
      const hit = unwrap(await searchUser(username));
      // A successful search is recorded server-side as a recent search.
      void queryClient.invalidateQueries({ queryKey: ["recent-searches"] });
      return hit;
    },
  });
}

export function useRecentSearches() {
  return useQuery({ queryKey: ["recent-searches"], queryFn: async () => unwrap(await listRecents()) });
}

export function useRecentActions() {
  const queryClient = useQueryClient();
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["recent-searches"] });
  return {
    clear: useMutation({ mutationFn: async (id: string) => unwrap(await clearRecent(id)), onSuccess: refresh }),
    clearAll: useMutation({ mutationFn: async () => unwrap(await clearAllRecents()), onSuccess: refresh }),
  };
}

export function useUserProfile(username: string) {
  return useQuery({
    queryKey: ["user-profile", username],
    enabled: username.length > 0,
    queryFn: async () => unwrap(await getUserProfile(username)),
  });
}

export function useContactActions() {
  const queryClient = useQueryClient();
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["contacts"] });
    void queryClient.invalidateQueries({ queryKey: ["user-profile"] });
  };
  return {
    add: useMutation({ mutationFn: async (u: string) => unwrap(await addContact(u)), onSuccess: refresh }),
    remove: useMutation({ mutationFn: async (u: string) => unwrap(await removeContact(u)), onSuccess: refresh }),
    startChat: useMutation({
      mutationFn: async (u: string) => unwrap(await startDirectChat(u)),
      onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["chats"] }),
    }),
  };
}

export function useMyProfile() {
  return useQuery({ queryKey: ["my-profile"], queryFn: async () => unwrap(await getMyProfile()) });
}

export function useProfileActions() {
  const queryClient = useQueryClient();
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["my-profile"] });
    void queryClient.invalidateQueries({ queryKey: ["chats"] });
  };
  return {
    save: useMutation({
      mutationFn: async (input: { displayName: string; bio: string; timezone?: string }) =>
        unwrap(await saveMyProfile(input)),
      onSuccess: refresh,
    }),
    upload: useMutation({
      mutationFn: async (input: { userId: string; uri: string; mimeType: string }) =>
        unwrap(await uploadMyAvatar(input)),
      onSuccess: refresh,
    }),
    remove: useMutation({ mutationFn: async () => unwrap(await removeMyAvatar()), onSuccess: refresh }),
    changeUsername: useMutation({
      mutationFn: async (username: string) => unwrap(await changeMyUsername(username)),
      onSuccess: refresh,
    }),
  };
}
