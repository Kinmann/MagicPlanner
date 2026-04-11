import sqlite3
import os

db_path = os.path.expandvars(r'%APPDATA%\com.gamedex02.magicplanner\magic_planner.db')
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

project_id = '7aef7ae5-4576-41b1-b0db-0517ca9e1118' # 알파카
node_type = 'Genesis_PRD'

# 1. Find the node_id
cursor.execute("SELECT node_id FROM document_node WHERE project_id = ? AND target_node_type = ?", (project_id, node_type))
node_id = cursor.fetchone()[0]

print(f"Target Project: 알파카 ({project_id})")
print(f"Target Node: {node_type} ({node_id})")

# 2. Reset all is_pass to 0 for this node
cursor.execute("UPDATE generation_iteration SET is_pass = 0 WHERE node_id = ?", (node_id,))
print(f"Reset is_pass for all iterations of node {node_id}")

# 3. Set is_pass to 1 for iteration 2
cursor.execute("UPDATE generation_iteration SET is_pass = 1 WHERE node_id = ? AND iteration_number = 2", (node_id,))
print(f"Set is_pass = 1 for Iteration 2 of node {node_id}")

conn.commit()

# 4. Verify
cursor.execute("SELECT iteration_id, iteration_number, is_pass FROM generation_iteration WHERE node_id = ?", (node_id,))
rows = cursor.fetchall()
print("\n--- Current Status for 알파카 Genesis_PRD ---")
for row in rows:
    print(f"ID: {row[0]}, Num: {row[1]}, IsPass: {row[2]}")

conn.close()
