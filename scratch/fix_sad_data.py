import sqlite3
import os

db_path = os.path.expandvars(r'%APPDATA%\com.gamedex02.magicplanner\magic_planner.db')
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

print(">>> Starting SAD Data Migration...")

# 1. target_node_type 'SAD' -> 'SAD_Global'
cursor.execute("UPDATE document_node SET target_node_type = 'SAD_Global' WHERE target_node_type = 'SAD'")
print(f"Nodes renamed: {cursor.rowcount}")

# 2. is_pass = 1 reset for non-COMPLETED nodes (SAD_Global, SAD_Module)
# We reset is_pass for iterations if their parent node is not yet COMPLETED.
cursor.execute("""
    UPDATE generation_iteration
    SET is_pass = 0
    WHERE is_pass = 1 AND node_id IN (
        SELECT node_id FROM document_node
        WHERE target_node_type IN ('SAD_Global', 'SAD_Module')
        AND node_state != 'COMPLETED'
    )
""")
print(f"Iterations reset: {cursor.rowcount}")

conn.commit()
conn.close()
print(">>> Migration Completed.")
