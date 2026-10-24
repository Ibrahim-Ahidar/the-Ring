"use server";

import { isE2eeEnabled } from "@pulse/core";
import { err, type Result } from "@pulse/core/result";

import { getSessionContext } from "@/platform/session";
import * as devices from "./service";

export async function removeDeviceAction(deviceId: string): Promise<Result<null>> {
  if (!isE2eeEnabled()) {
    return err("platform.unexpected");
  }
  const ctx = await getSessionContext();
  if (!ctx) {
    return err("platform.unauthenticated");
  }
  return devices.removeDevice(ctx.rpc, deviceId);
}
