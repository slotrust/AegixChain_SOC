async function run() {
  for(let i=0; i<3; i++) {
    const res = await fetch("https://ais-dev-cghmbphft552woax27vikj-558747011348.asia-east1.run.app/api/auth/login", {
      method: "POST",
      body: JSON.stringify({username: "admin", password: `pwd${i}`}),
      headers: {"Content-Type": "application/json"}
    });
    console.log(res.status, await res.text());
  }
}
run();
