export const APP_VERSION = __APP_VERSION__;
export const APP_BUILD = __APP_BUILD__;
export const PLAY_PROTOCOL = __PLAY_PROTOCOL__;

export function versionLabel() {
  return `v${APP_VERSION}`;
}

export function versionStamp() {
  return `v${APP_VERSION} · ${APP_BUILD}`;
}
