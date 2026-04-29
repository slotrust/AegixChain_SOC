import { ipsService } from "./src/backend/services/ips_service.js";
ipsService.init();
console.log("Blocked IPs:", ipsService.getBlockedIps());
