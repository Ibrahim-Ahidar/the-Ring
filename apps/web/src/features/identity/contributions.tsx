import type { FeatureContributions } from "@/shell/slots/types";

import { PasswordUpdatedToast } from "./components/PasswordUpdatedToast";

export const contributions: FeatureContributions = {
  overlay: [{ id: "identity-password-updated-toast", Component: PasswordUpdatedToast }],
};
