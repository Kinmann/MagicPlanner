import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import os from 'node:os';

const dbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'com.gamedex02.magicplanner', 'magic_planner.db');

console.log('Opening DB for clearing at:', dbPath);

try {
    const db = new DatabaseSync(dbPath);
    
    // Disable foreign key constraints to allow deleting in any order
    db.exec("PRAGMA foreign_keys = OFF;");
    
    // Get all tables
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    
    const tablesToSkip = ['user_session', 'sqlite_sequence'];
    
    console.log('--- Clearing Database ---');
    for (const table of tables) {
        if (tablesToSkip.includes(table.name) || table.name.startsWith('sqlite_')) {
            console.log(`Skipping table: ${table.name}`);
            continue;
        }

        try {
            db.exec(`DELETE FROM ${table.name}`);
            console.log(`Cleared table: ${table.name}`);
        } catch (e) {
            console.log(`Failed to clear table ${table.name}: ${e.message}`);
            // If it's a virtual table or has some other issue, we might need to skip it or handle differently
        }
    }
    
    // Re-enable foreign key constraints
    db.exec("PRAGMA foreign_keys = ON;");
    
    // Optional: Vacuum to reclaim space
    db.exec("VACUUM;");
    
    console.log('--- Database clearing finished ---');
    
    db.close();
} catch (error) {
    console.error('Error during database clearing:', error);
}
