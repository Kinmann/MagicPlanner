import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import os from 'node:os';

const dbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'com.gamedex02.magicplanner', 'magic_planner.db');

try {
    const db = new DatabaseSync(dbPath);
    
    // Get all tables
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    
    console.log('--- Database Status ---');
    if (tables.length === 0) {
        console.log('No tables found in the database.');
    } else {
        for (const table of tables) {
            try {
                const count = db.prepare(`SELECT COUNT(*) as count FROM ${table.name}`).get();
                console.log(`${table.name}: ${count.count} rows`);
            } catch (e) {
                console.log(`${table.name}: [Error reading: ${e.message}]`);
            }
        }
    }
    
    db.close();
} catch (error) {
    console.error('Error reading database:', error);
}
