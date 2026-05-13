import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import os from 'node:os';

const dbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'com.gamedex02.magicplanner', 'magic_planner.db');
const db = new DatabaseSync(dbPath);

const nodeId = '5be04461-fcbd-4f1e-a1ff-f6ad9bdb109f';
const node = db.prepare(`SELECT node_id, node_state, current_best_score, current_iteration FROM document_node WHERE node_id = ?`).get(nodeId);
console.log('Node:', JSON.stringify(node, null, 2));

db.close();
