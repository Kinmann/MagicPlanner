import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import os from 'node:os';

const dbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'com.gamedex02.magicplanner', 'magic_planner.db');
console.log('Opening DB at:', dbPath);

const db = new DatabaseSync(dbPath);

const nodes = db.prepare(`SELECT * FROM document_node`).all();
const inProgressNodes = nodes.filter(n => n.node_state === 'IN_PROGRESS');

if (inProgressNodes.length > 0) {
    for (const node of inProgressNodes) {
        const updateNode = db.prepare(`
            UPDATE document_node 
            SET node_state = 'READY', 
                current_iteration = 0, 
                current_best_score = 0, 
                api_error_message = NULL 
            WHERE node_id = ?
        `);
        updateNode.run(node.node_id);

        const delIter = db.prepare(`DELETE FROM generation_iteration WHERE node_id = ?`);
        delIter.run(node.node_id);
    }
    console.log('Database successfully reset and cleaned up!');
} else {
    console.log('No nodes stuck in IN_PROGRESS. No action taken.');
}

db.close();
