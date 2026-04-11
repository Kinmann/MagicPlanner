import sqlite3
import os
import json

db_path = os.path.expandvars(r'%APPDATA%\com.gamedex02.magicplanner\magic_planner.db')
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

print("--- Iterations State ---")
cursor.execute("""
    SELECT 
        p.project_name, 
        dn.target_node_type, 
        gi.iteration_number, 
        gi.is_pass, 
        gi.iteration_id,
        gi.generated_draft_json
    FROM generation_iteration gi
    JOIN document_node dn ON gi.node_id = dn.node_id
    JOIN project p ON dn.project_id = p.project_id
    ORDER BY p.project_name, dn.target_node_type, gi.iteration_number
""")
rows = cursor.fetchall()
for row in rows:
    p_name, node_type, it_num, is_pass, it_id, json_str = row
    status = "N/A"
    try:
        data = json.loads(json_str)
        status = data.get('metadata', {}).get('status', 'N/A')
    except:
        pass
    print(f"Project: {p_name} | Node: {node_type} | Iter: {it_num} | IsPass: {is_pass} | Status: {status}")

conn.close()
