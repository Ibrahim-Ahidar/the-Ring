import "server-only";

import { cookies } from "next/headers";

import { DEVICE_COOKIE_NAME } from "@/platform/session";

export { DEVICE_COOKIE_NAME };

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export async function readDeviceId(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(DEVICE_COOKIE_NAME)?.value;
}

export async function writeDeviceId(deviceId: string): Promise<void> {
  const store = await cookies();
  store.set(DEVICE_COOKIE_NAME, deviceId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
  });
}

export async function clearDeviceId(): Promise<void> {
  const store = await cookies();
  store.delete(DEVICE_COOKIE_NAME);
}
