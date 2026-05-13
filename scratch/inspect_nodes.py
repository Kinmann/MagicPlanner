import sqlite3
import os

db_path = 'magic-planner.db'
if not os.path.exists(db_path):
    # Try current directory first, then look around
    print(f"DB not found at {db_path}")
    exit(1)

conn = sqlite3.connect(db_path)
cur = conn.cursor()

query = """
SELECT 
    dn.node_id, 
    lm.module_name, 
    dn.node_category, 
    dn.target_node_type,
    dn.project_id
FROM document_node dn 
LEFT JOIN local_module lm ON dn.module_id = lm.module_id 
"""
cur.execute(query)
rows = cur.fetchall()

print(f"{'Node ID':<40} | {'Module':<15} | {'Category':<15} | {'Type':<30}")
print("-" * 110)
for row in rows:
    print(f"{row[0]:<40} | {str(row[1]):<15} | {str(row[2]):<15} | {row[3]:<30}")

conn.close()
