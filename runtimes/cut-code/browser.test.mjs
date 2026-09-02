import { test } from 'node:test';
import assert from 'node:assert/strict';
import { browserLaunchOptions } from './browser.mjs';

test('both image-owned browsers require the sandbox with identical launch limits', () => {
  const bundled = browserLaunchOptions();
  const system = browserLaunchOptions('debian-chromium');
  assert.deepEqual(system, { ...bundled, executablePath: '/usr/bin/chromium' });
  assert.equal(bundled.chromiumSandbox, true);
  assert.equal(bundled.timeout, 20_000);
  assert.deepEqual(bundled.args, ['--disable-dev-shm-usage']);
});

test('unknown browsers, arbitrary paths and launch flags fail closed', () => {
  for (const input of ['', null, false, '/tmp/chromium', '--no-sandbox', 'debian-chromium --no-sandbox']) {
    assert.throws(() => browserLaunchOptions(input), /Unsupported image browser/);
  }
});
