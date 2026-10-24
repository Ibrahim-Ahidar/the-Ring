import type { FeatureContributions } from "@/shell/slots/types";

import { DeviceChangeNotice } from "@/features/e2ee-devices/components/DeviceChangeNotice";
import { DevicesWatcher } from "@/features/e2ee-devices/components/DevicesWatcher";

export const contributions: FeatureContributions = {
  overlay: [{ id: "e2ee-devices-watcher", Component: DevicesWatcher }],
  headerStatus: [{ id: "e2ee-devices-notice", order: 90, Component: DeviceChangeNotice }],
};
