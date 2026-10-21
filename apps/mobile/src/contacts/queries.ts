import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  addContact,
  getMyProfile,
  listContacts,
  removeContact,
  removeMyAvatar,
  saveMyProfile,
  searchUser,
  startDirectChat,
  uploadMyAvatar,
} from "@/data";

function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: { code: string } }): T {
  if (!result.ok) throw new Error(result.error.code);
  return result.value;
}

export function useContacts() {
  return useQuery({ queryKey: ["contacts"], queryFn: async () => unwrap(await listContacts()) });
}

export function useUserSearch(username: string) {
  return useQuery({
    queryKey: ["user-search", username],
    enabled: username.length > 0,
    queryFn: async () => unwrap(await searchUser(username)),
  });
}

export function useContactActions() {
  const queryClient = useQueryClient();
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["contacts"] });
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
      mutationFn: async (input: { displayName: string; bio: string }) => unwrap(await saveMyProfile(input)),
      onSuccess: refresh,
    }),
    upload: useMutation({
      mutationFn: async (input: { userId: string; uri: string; mimeType: string }) =>
        unwrap(await uploadMyAvatar(input)),
      onSuccess: refresh,
    }),
    remove: useMutation({ mutationFn: async () => unwrap(await removeMyAvatar()), onSuccess: refresh }),
  };
}
