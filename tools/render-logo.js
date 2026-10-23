// Renders the logo, app icons and share image from tools/logo.html into public/.
// Usage: node tools/render-logo.js   (needs Playwright with Chromium installed)
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`file://${path.join(__dirname, 'logo.html')}`);
  const files = await page.evaluate(() => window.render());
  for (const [name, base64] of Object.entries(files)) {
    const out = path.join(__dirname, '..', 'public', name);
    fs.writeFileSync(out, Buffer.from(base64, 'base64'));
    console.log('wrote', path.relative(process.cwd(), out));
  }
  await browser.close();
})();
