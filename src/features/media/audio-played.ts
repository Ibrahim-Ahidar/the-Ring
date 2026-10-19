/** Record a play only for a received voice message, and only once per mount. */
export function shouldRecordPlay(input: {
  isOwn: boolean;
  alreadyRecorded: boolean;
}): boolean {
  return !input.isOwn && !input.alreadyRecorded;
}
