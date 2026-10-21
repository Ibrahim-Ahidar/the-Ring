"use client";

import { ErrorScreen } from "@/shell/components/ErrorScreen";

export default function AppError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorScreen {...props} boundary="app" />;
}
