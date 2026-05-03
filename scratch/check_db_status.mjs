import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import os from 'node:os';

const dbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'com.magicplanner.main', 'magic_planner.db');
console.log('Opening DB at:', dbPath);

const db = new DatabaseSync(dbPath);

try {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    console.log('Tables:', tables.map(t => t.name).join(', '));

    for (const table of tables) {
        if (table.name.startsWith('sqlite_')) continue;
        const count = db.prepare(`SELECT count(*) as count FROM ${table.name}`).get();
        console.log(`Table ${table.name}: ${count.count} rows`);
    }
} catch (err) {
    console.error('Error querying DB:', err);
} finally {
    db.close();
}
