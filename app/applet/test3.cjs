const http = require('https');
async function run() {
    const postData = JSON.stringify({ username: "admin", password: `p1` });
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
          console.log(`Headers: ${JSON.stringify(res.headers, null, 2)}`);
          resolve();
        });
      });
      req.write(postData);
      req.end();
    });
}
run();
