use sqlx::SqlitePool;
use std::env;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let pool = SqlitePool::connect("sqlite:magic_planner.db").await?;
    let rows = sqlx::query("SELECT DISTINCT target_node_type FROM document_node")
        .fetch_all(&pool)
        .await?;

    println!("--- Node Types in DB ---");
    for row in rows {
        let node_type: String = sqlx::Row::get(&row, 0);
        println!("{}", node_type);
    }
    println!("------------------------");
    Ok(())
}
