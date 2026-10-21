import type { Result } from "@pulse/core";

/** Everything the Device lifecycle needs from the outside world. */
export interface DeviceDeps {
  /** Expo push token, or null when unavailable (permission denied, emulator). */
  getPushToken(): Promise<string | null>;
  callRpc<T>(fn: string, args: Record<string, unknown>): Promise<Result<T>>;
  /** Persists the (non-secret) Device id so logout can remove it after a restart. */
  idStore: {
    get(): Promise<string | null>;
    set(id: string): Promise<void>;
    clear(): Promise<void>;
  };
  platform: string;
  appVersion: string | null;
  log(message: string, cause?: unknown): void;
}

export interface DeviceLifecycle {
  /** Registers this phone for the signed-in user. Never throws. */
  register(): Promise<void>;
  /** Removes this phone's Device. Never throws. */
  unregister(): Promise<void>;
}

export function createDeviceLifecycle(deps: DeviceDeps): DeviceLifecycle {
  return {
    async register() {
      try {
        const token = await deps.getPushToken();
        if (!token) return;
        const res = await deps.callRpc<string>("register_device", {
          p_client: "mobile",
          p_platform: deps.platform,
          p_push_token: token,
          p_app_version: deps.appVersion,
        });
        if (!res.ok) {
          deps.log("register_device failed", res.error);
          return;
        }
        await deps.idStore.set(res.value);
      } catch (e) {
        deps.log("register device failed", e);
      }
    },
    async unregister() {
      try {
        const id = await deps.idStore.get();
        if (!id) return;
        const res = await deps.callRpc<null>("unregister_device", { p_device_id: id });
        if (!res.ok) {
          deps.log("unregister_device failed", res.error);
          return;
        }
        await deps.idStore.clear();
      } catch (e) {
        deps.log("unregister device failed", e);
      }
    },
  };
}

export interface AuthActionsDeps<S> {
  signIn(email: string, password: string): Promise<Result<S>>;
  signOut(): Promise<Result<null>>;
  devices: DeviceLifecycle;
  /** Upper bound on how long logout waits for the Device removal. */
  unregisterTimeoutMs?: number;
}

/** Wraps sign-in/sign-out so Devices follow the session without ever blocking it. */
export function withDeviceLifecycle<S>(deps: AuthActionsDeps<S>) {
  const timeoutMs = deps.unregisterTimeoutMs ?? 3000;
  return {
    async signIn(email: string, password: string): Promise<Result<S>> {
      const result = await deps.signIn(email, password);
      // Fire and forget: registration must not delay or fail login.
      if (result.ok) void deps.devices.register();
      return result;
    },
    async signOut(): Promise<Result<null>> {
      // Before signing out, while the session still authorises the RPC.
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<void>((resolve) => {
        timer = setTimeout(resolve, timeoutMs);
      });
      try {
        await Promise.race([deps.devices.unregister(), timeout]);
      } finally {
        clearTimeout(timer);
      }
      return deps.signOut();
    },
  };
}
