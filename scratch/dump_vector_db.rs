use sqlx::sqlite::SqlitePool;
use sqlx::Row;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    tauri::async_runtime::block_on(async {
        let db_path = "C:/Users/gamedex02/AppData/Roaming/com.gamedex02.magicplanner/magic_planner.db";
        let pool = SqlitePool::connect(&format!("sqlite:{}", db_path)).await?;

        println!("--- Vector DB Metadata (embedding_metadata) ---");
        let rows = sqlx::query("SELECT project_id, node_type, chunk_text, created_at FROM embedding_metadata ORDER BY created_at DESC LIMIT 5")
            .fetch_all(&pool)
            .await?;

        if rows.is_empty() {
            println!("데이터가 아직 인덱싱되지 않았습니다. (0건)");
        } else {
            for row in rows {
                let project_id: String = row.get(0);
                let node_type: String = row.get(1);
                let chunk_text: String = row.get(2);
                let created_at: String = row.get(3);
                
                println!("Project: {}", project_id);
                println!("Type: {}", node_type);
                println!("Text: {}...", chunk_text.chars().take(100).collect::<String>());
                println!("Created: {}", created_at);
                println!("-------------------------------------------");
            }
        }

        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM embedding_metadata")
            .fetch_one(&pool)
            .await?;
        println!("Total Vector Chunks: {}", count);

        Ok::<(), Box<dyn std::error::Error>>(())
    })
}
