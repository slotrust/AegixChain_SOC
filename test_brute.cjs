async function test() {
  for(let i = 0; i < 20; i++) {
    const res = await fetch("https://ais-dev-cghmbphft552woax27vikj-558747011348.asia-east1.run.app/api/auth/login", {
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
