export function isTmdDesktop() {
  const chrome = (window as unknown as { chrome?: { webview?: unknown } }).chrome;
  return !!chrome?.webview;
}
