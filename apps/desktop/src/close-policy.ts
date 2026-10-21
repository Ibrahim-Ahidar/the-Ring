/** Closing the window hides it to the tray unless the app is really quitting. */
export function shouldHideOnClose(s: { isQuitting: boolean }): boolean {
  return !s.isQuitting;
}
