const http = require('http');

async function test() {
  for(let i = 0; i < 20; i++) {
    const res = await fetch("http://127.0.0.1:3000/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "admin",
        password: "wrongpass" + i
      })
    });
    console.log(`[${i+1}] Request sent - Status: ${res.status} - Body: ${await res.text()}`);
  }
}
test();
