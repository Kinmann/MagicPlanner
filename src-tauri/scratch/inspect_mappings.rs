
use sqlx::{SqlitePool, Row};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let pool = SqlitePool::connect("sqlite:src-tauri/storage.db").await?;
    let rows = sqlx::query(
        "SELECT artifact_id, COUNT(*) as cnt FROM artifact_mapping GROUP BY artifact_id ORDER BY cnt DESC LIMIT 20"
    ).fetch_all(&pool).await?;

    println!("Top Artifact Mappings:");
    for row in rows {
        let id: String = row.get(0);
        let cnt: i32 = row.get(1);
        println!("{}: {}", id, cnt);
    }

    let sample = sqlx::query(
        "SELECT node_id, artifact_id, json_path FROM artifact_mapping LIMIT 10"
    ).fetch_all(&pool).await?;

    println!("\nSample Mappings:");
    for row in sample {
        let nid: String = row.get(0);
        let aid: String = row.get(1);
        let path: String = row.get(2);
        println!("Node: {}, Artifact: {}, Path: {}", nid, aid, path);
    }

    Ok(())
}
