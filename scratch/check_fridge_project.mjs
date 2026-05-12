import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import os from 'node:os';

const dbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'com.gamedex02.magicplanner', 'magic_planner.db');
const db = new DatabaseSync(dbPath);

const projectId = '83042712-cec8-4617-b477-ebbb254cfd32';
const nodes = db.prepare(`SELECT node_id, target_node_type, node_state FROM document_node WHERE project_id = ? AND target_node_type = 'GPRD_Architecture_Schema'`).all(projectId);
console.log(JSON.stringify(nodes, null, 2));

if (nodes.length > 0) {
    const nodeId = nodes[0].node_id;
    const iters = db.prepare(`SELECT iteration_id, iteration_number, is_pass, calculated_score FROM generation_iteration WHERE node_id = ? ORDER BY iteration_number DESC`).all(nodeId);
    console.log('Iterations:', JSON.stringify(iters, null, 2));
}

db.close();
