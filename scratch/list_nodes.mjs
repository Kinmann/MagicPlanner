import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import os from 'node:os';

const dbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'com.gamedex02.magicplanner', 'magic_planner.db');
const db = new DatabaseSync(dbPath);

const nodes = db.prepare(`SELECT node_id, target_node_type, node_state FROM document_node`).all();
console.log(JSON.stringify(nodes, null, 2));

db.close();
