const axios = require('axios');

async function run() {
  console.log("Scanning...");
  let res = await axios.post('http://127.0.0.1:3000/api/edr/scan');
  console.log("Scan:", res.data);
  let vulns = await axios.get('http://127.0.0.1:3000/api/edr/vulnerabilities');
  console.log("Vulns:", vulns.data.length);
  
  if (vulns.data.length > 0) {
    console.log("Patching one...", vulns.data[0].package_name);
    await axios.post('http://127.0.0.1:3000/api/edr/remediate', {
      packageName: vulns.data[0].package_name,
      range: vulns.data[0].vulnerable_versions
    });
    
    let vulns2 = await axios.get('http://127.0.0.1:3000/api/edr/vulnerabilities');
    console.log("Vulns after 1 patch:", vulns2.data.length);

    console.log("Patching All...");
    await axios.post('http://127.0.0.1:3000/api/edr/remediate-critical');

    let vulns3 = await axios.get('http://127.0.0.1:3000/api/edr/vulnerabilities');
    console.log("Vulns after all patch:", vulns3.data.length);
  }
}
run();
