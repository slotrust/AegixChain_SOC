import fs from 'fs';
async function run() {
    const res = await fetch("https://ais-dev-cghmbphft552woax27vikj-558747011348.asia-east1.run.app/api/auth/login");
    console.log(`GET /api/auth/login Status: ${res.status}`);
    const body = await res.text();
    console.log(`Body starts with: ${body.substring(0, 50)}`);
}
run();
