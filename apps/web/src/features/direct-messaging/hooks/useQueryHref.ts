"use client";

import { useSearchParams } from "next/navigation";
import { useCallback } from "react";

/**
 * Builds `path?query` keeping the current inbox filters (folder, archived) and
 * applying the given changes (`null` removes a key).
 */
export function useQueryHref() {
  const searchParams = useSearchParams();

  return useCallback(
    (path: string, changes: Record<string, string | null> = {}) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(changes)) {
        if (value === null) {
          next.delete(key);
        } else {
          next.set(key, value);
        }
      }
      const query = next.toString();
      return query ? `${path}?${query}` : path;
    },
    [searchParams],
  );
}
