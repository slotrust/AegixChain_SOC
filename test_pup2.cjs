const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
  page.on('requestfailed', request => console.log('PAGE LOG: Failed to load resource: ' + request.url() + ' - ' + request.failure().errorText));
  page.on('response', response => {
    if (!response.ok() && response.status() !== 200 && response.status() !== 204 && response.status() !== 304) {
      console.log(`PAGE LOG: Response error ${response.status()} from ${response.url()}`);
    }
  });

  await page.goto('http://localhost:3000');
  await page.evaluate(() => {
    localStorage.setItem('soc_user', JSON.stringify({ id: '1', username: 'admin', role: 'admin' }));
    localStorage.setItem('soc_token', 'dummy-token'); // Add valid token
  });
  await page.goto('http://localhost:3000');

  await new Promise(r => setTimeout(r, 3000));
  const bodyHasLogin = await page.evaluate(() => document.body.innerHTML.toLowerCase().includes('login'));
  console.log("BODY HAS LOGIN?", bodyHasLogin);
  const html = await page.evaluate(() => document.getElementById('root').innerHTML.substring(0, 2000));
  console.log("ROOT BODY:", html);
  
  // also take screenshot just to check what the DOM structure looks like conceptually via elements
  const elements = await page.evaluate(() => {
    return Array.from(document.body.children).map(c => c.tagName + ' id=' + c.id + ' class=' + c.className);
  });
  console.log("BODY CHILDREN:", elements);

  await browser.close();
})();
