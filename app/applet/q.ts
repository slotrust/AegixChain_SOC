import { db } from "../../src/backend/database.js";
const logs = db.prepare("SELECT * FROM logs WHERE event_type = 'api_request' ORDER BY id DESC LIMIT 5").all();
console.log(JSON.stringify(logs, null, 2));
