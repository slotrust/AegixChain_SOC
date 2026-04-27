import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ 
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
    headless: true 
  });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.toString()));

  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.setItem('soc_user', JSON.stringify({ id: '1', username: 'test', role: 'analyst' }));
  });
  
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0', timeout: 10000 }).catch(e => console.log('GOTO ERR', e));
  
  await new Promise(r => setTimeout(r, 2000));
  const content = await page.content();
  console.log('BODY:', content.slice(0, 500));
  
  const overlay = await page.$eval('#error-overlay', el => el.textContent).catch(() => 'no overlay');
  if (overlay && overlay !== 'no overlay') {
    console.log('OVERLAY:', overlay);
  }
  
  await browser.close();
})();


