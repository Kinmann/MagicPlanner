import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import os from 'node:os';

const dbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'com.gamedex02.magicplanner', 'magic_planner.db');
const db = new DatabaseSync(dbPath);

const nodeId = '5be04461-fcbd-4f1e-a1ff-f6ad9bdb109f';
const iters = db.prepare(`SELECT iteration_id, iteration_number, is_pass, is_archived, calculated_score FROM generation_iteration WHERE node_id = ? ORDER BY iteration_number DESC`).all(nodeId);

console.log(JSON.stringify(iters, null, 2));

db.close();
