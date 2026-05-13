
use sqlx::sqlite::SqlitePool;
use std::env;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let db_path = "C:\\Users\\gamedex02\\AppData\\Roaming\\com.gamedex02.magicplanner\\magic_planner.db";
    let pool = SqlitePool::connect(&format!("sqlite:{}", db_path)).await?;

    let rows = sqlx::query("SELECT node_id, target_node_type, node_category, project_id, is_deleted FROM document_node WHERE node_id LIKE 'mock-%' OR target_node_type LIKE 'mock-%'")
        .fetch_all(&pool)
        .await?;

    println!("Found {} mock-related nodes in DB:", rows.len());
    for row in rows {
        let id: String = sqlx::Row::get(&row, 0);
        let t_type: String = sqlx::Row::get(&row, 1);
        let cat: String = sqlx::Row::get(&row, 2);
        let pid: String = sqlx::Row::get(&row, 3);
        let deleted: bool = sqlx::Row::get(&row, 4);
        println!("ID: {}, Type: {}, Cat: {}, Project: {}, Deleted: {}", id, t_type, cat, pid, deleted);
    }

    let modules = sqlx::query("SELECT module_id, module_name, project_id FROM local_module")
        .fetch_all(&pool)
        .await?;
    println!("Found {} modules in DB:", modules.len());
    for m in modules {
        let id: String = sqlx::Row::get(&m, 0);
        let name: String = sqlx::Row::get(&m, 1);
        let pid: String = sqlx::Row::get(&m, 2);
        println!("ID: {}, Name: {}, Project: {}", id, name, pid);
    }

    Ok(())
}
