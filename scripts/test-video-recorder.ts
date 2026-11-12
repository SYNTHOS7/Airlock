import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

process.env.PLAYWRIGHT_FFMPEG_PATH = 'C:\\Users\\Shlok Shah\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-7.1-full_build\\bin\\ffmpeg.exe';

async function testBrowser() {
  const videoDir = resolve('D:/Airlock/recordings/test');
  mkdirSync(videoDir, { recursive: true });

  console.log('Launching Chrome with video recording...');
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: {
      dir: videoDir,
      size: { width: 1920, height: 1080 },
    },
  });

  const page = await context.newPage();
  console.log('Navigating to http://localhost:3000...');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 30000 });
  console.log('Page title:', await page.title());

  await page.waitForTimeout(3000);
  await context.close();
  await browser.close();
  console.log('Test completed successfully! Video saved to:', videoDir);
}

testBrowser().catch(console.error);
