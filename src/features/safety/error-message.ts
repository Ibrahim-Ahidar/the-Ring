export function privacyErrorKey(code: string): string {
  switch (code) {
    case "safety.invalid_setting":
      return "errors.invalidSetting";
    case "safety.not_found":
      return "errors.notFound";
    case "safety.cannot_block_self":
      return "errors.cannotBlockSelf";
    case "platform.rate_limited":
      return "errors.rateLimited";
    case "platform.unauthenticated":
      return "errors.unauthenticated";
    default:
      return "errors.generic";
  }
}
