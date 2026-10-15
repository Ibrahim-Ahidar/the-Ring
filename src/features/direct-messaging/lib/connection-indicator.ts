export type ConnectionIndicatorStatus =
  | "connected"
  | "reconnecting"
  | "offline"
  | "disconnected";

export type ConnectionIndicatorOutput = "none" | "connecting" | "waitingForNetwork";

export const CONNECTION_GRACE_MS = 3000;

type Options = {
  graceMs?: number;
  onChange: (output: ConnectionIndicatorOutput) => void;
};

/**
 * Decides when to show a "connecting" bar. It appears only after the status has
 * been non-connected for `graceMs` of visible time, so short blips never flash.
 */
export function createConnectionIndicator({
  graceMs = CONNECTION_GRACE_MS,
  onChange,
}: Options) {
  let status: ConnectionIndicatorStatus = "connected";
  let visible = true;
  let output: ConnectionIndicatorOutput = "none";
  let timer: ReturnType<typeof setTimeout> | null = null;

  const emit = (next: ConnectionIndicatorOutput) => {
    if (next !== output) {
      output = next;
      onChange(next);
    }
  };

  const label = (): ConnectionIndicatorOutput =>
    status === "offline" ? "waitingForNetwork" : "connecting";

  const stopTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const startTimer = () => {
    stopTimer();
    timer = setTimeout(() => {
      timer = null;
      emit(label());
    }, graceMs);
  };

  const sync = (restart: boolean) => {
    if (status === "connected") {
      stopTimer();
      emit("none");
      return;
    }
    if (!visible) {
      stopTimer();
      emit("none");
      return;
    }
    if (output !== "none") {
      emit(label());
      return;
    }
    if (restart || timer === null) {
      startTimer();
    }
  };

  return {
    setStatus(next: ConnectionIndicatorStatus) {
      if (next === status) {
        return;
      }
      const wasConnected = status === "connected";
      status = next;
      sync(wasConnected);
    },
    setVisible(next: boolean) {
      if (next === visible) {
        return;
      }
      visible = next;
      sync(true);
    },
    dispose() {
      stopTimer();
    },
  };
}
