/** What this browser can do for screen sharing (blueprint 2.4). */
export interface BrowserCaps {
  name: 'chrome' | 'edge' | 'firefox' | 'safari' | 'other';
  os: 'windows' | 'mac' | 'linux' | 'android' | 'ios' | 'other';
  mobile: boolean;
  canShareScreen: boolean;
  canShareAudio: boolean;
  /** Full system audio (Windows / ChromeOS Chromium only). */
  canShareSystemAudio: boolean;
}

export function detectBrowser(): BrowserCaps {
  const ua = navigator.userAgent;
  const brands = (navigator as Navigator & { userAgentData?: { brands: { brand: string }[]; mobile: boolean } })
    .userAgentData;
  const isEdge = /Edg\//.test(ua);
  const isFirefox = /Firefox\//.test(ua);
  const isChromium = !!brands?.brands.some((b) => /Chromium|Google Chrome|Microsoft Edge/.test(b.brand)) || /Chrome\//.test(ua);
  const isSafari = /Safari\//.test(ua) && !isChromium && !isFirefox;
  const mobile = brands?.mobile ?? /Android|iPhone|iPad|Mobile/.test(ua);
  const os: BrowserCaps['os'] = /Windows/.test(ua)
    ? 'windows'
    : /iPhone|iPad/.test(ua)
      ? 'ios'
      : /Mac OS X/.test(ua)
        ? 'mac'
        : /Android/.test(ua)
          ? 'android'
          : /Linux|CrOS/.test(ua)
            ? 'linux'
            : 'other';
  const name: BrowserCaps['name'] = isEdge ? 'edge' : isFirefox ? 'firefox' : isSafari ? 'safari' : isChromium ? 'chrome' : 'other';
  const canShareScreen = !mobile && !!navigator.mediaDevices?.getDisplayMedia;
  const chromiumDesktop = (name === 'chrome' || name === 'edge') && !mobile;
  return {
    name,
    os,
    mobile,
    canShareScreen,
    canShareAudio: canShareScreen && chromiumDesktop,
    canShareSystemAudio: chromiumDesktop && (os === 'windows' || /CrOS/.test(ua)),
  };
}

export const caps = detectBrowser();
