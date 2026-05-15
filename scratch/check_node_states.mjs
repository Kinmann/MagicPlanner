import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import os from 'node:os';

const dbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'com.gamedex02.magicplanner', 'magic_planner.db');

try {
    const db = new DatabaseSync(dbPath);
    const nodes = db.prepare("SELECT target_node_type, node_state FROM document_node WHERE is_deleted = 0").all();
    console.log(JSON.stringify(nodes, null, 2));
    db.close();
} catch (error) {
    console.error('Error:', error);
}
