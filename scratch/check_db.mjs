import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import os from 'node:os';

const dbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'com.gamedex02.magicplanner', 'magic_planner.db');
const db = new DatabaseSync(dbPath);

const nodeId = '5be04461-fcbd-4f1e-af1f-f8ad9bdb109f';
const iters = db.prepare(`SELECT iteration_id, iteration_number, is_pass, calculated_score FROM generation_iteration WHERE node_id = ? ORDER BY iteration_number DESC`).all(nodeId);

console.log(JSON.stringify(iters, null, 2));

const node = db.prepare(`SELECT node_id, node_state, current_iteration FROM document_node WHERE node_id = ?`).get(nodeId);
console.log('Node State:', JSON.stringify(node, null, 2));

db.close();
