import { ipsService } from './src/backend/services/ips_service.js';
import { initDb } from './src/backend/database.js';

async function unblock() {
  await initDb();
  ipsService.init();
  ipsService.unblockIp('127.0.0.1');
}
unblock();
