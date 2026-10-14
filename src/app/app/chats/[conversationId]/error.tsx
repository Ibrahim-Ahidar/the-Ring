"use client";

export default function ConversationError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div role="alert" style={{ padding: "2rem" }}>
      <p>Could not load this conversation. Your messages are safe.</p>
      {error.digest ? <p>Reference: {error.digest}</p> : null}
      <button type="button" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
