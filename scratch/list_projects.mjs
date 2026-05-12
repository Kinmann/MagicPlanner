import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import os from 'node:os';

const dbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'com.gamedex02.magicplanner', 'magic_planner.db');
const db = new DatabaseSync(dbPath);

const projects = db.prepare(`SELECT project_id, project_name FROM project`).all();
console.log(JSON.stringify(projects, null, 2));

db.close();
