const http = require('https');
async function run() {
  for (let i = 0; i < 20; i++) {
    const postData = JSON.stringify({ username: "admin", password: `p${i}` });
    const options = {
      hostname: 'ais-dev-cghmbphft552woax27vikj-558747011348.asia-east1.run.app',
      port: 443,
      path: '/api/auth/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };
    await new Promise(resolve => {
      const req = http.request(options, (res) => {
        let body = "";
        res.on("data", d => body += d);
        res.on("end", () => {
          console.log(`Status: ${res.statusCode}`);
          resolve();
        });
      });
      req.write(postData);
      req.end();
    });
  }
}
run();
