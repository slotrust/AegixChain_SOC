import { db } from "./src/backend/database.js";
const logs = db.prepare("SELECT * FROM logs ORDER BY id DESC LIMIT 20;").all();
console.log(JSON.stringify(logs, null, 2));
