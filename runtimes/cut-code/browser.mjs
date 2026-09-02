// Image-owned selection only. A capsule cannot choose a binary or launch flags.
export function browserLaunchOptions(imageBrowser) {
  if (imageBrowser !== undefined && imageBrowser !== 'debian-chromium') {
    throw new Error('Unsupported image browser.');
  }
  return {
    headless: true,
    chromiumSandbox: true,
    args: ['--disable-dev-shm-usage'],
    timeout: 20_000,
    ...(imageBrowser === 'debian-chromium' ? { executablePath: '/usr/bin/chromium' } : {}),
  };
}
