
use sqlx::{SqlitePool, Row};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let pool = SqlitePool::connect("sqlite:storage.db").await?;
    let rows = sqlx::query(
        "SELECT dn.target_node_type, gi.generated_draft_json FROM generation_iteration gi 
         JOIN document_node dn ON dn.node_id = gi.node_id 
         WHERE gi.is_pass = 1 LIMIT 5"
    ).fetch_all(&pool).await?;

    for row in rows {
        let ntype: String = row.get(0);
        let json: String = row.get(1);
        println!("Type: {}", ntype);
        println!("JSON: {}", &json[..json.len().min(500)]);
        println!("---");
    }
    Ok(())
}
