use sqlx::{SqlitePool, Row};
use crate::models::LocalModule;

pub fn get_required_sad_keys(node_type: &str) -> Vec<&str> {
    match node_type {
        "PRD" => vec!["SAD_Auth_RBAC", "SAD_Core_ERD"],
        "FSD" => vec!["SAD_Auth_RBAC", "SAD_Core_ERD", "SAD_Interface_Error", "SAD_Non_Tech_Constraint"],
        "ERD" => vec!["SAD_Tech_Stack", "SAD_Core_ERD"],
        "API_Spec" => vec!["SAD_Interface_Error", "SAD_Auth_RBAC"],
        "TC" => vec!["SAD_Auth_RBAC", "SAD_Interface_Error", "SAD_Non_Tech_Constraint"],
        "User Flow" => vec!["SAD_Auth_RBAC", "SAD_Interface_Error"],
        "IA" => vec!["SAD_Auth_RBAC", "SAD_Core_ERD"],
        "Wireframe" => vec!["SAD_Core_ERD", "SAD_Interface_Error", "SAD_Tech_Stack"],
        _ => vec![],
    }
}

pub fn get_filtered_local_module_context(node_type: &str, module: &LocalModule) -> String {
    let mut ctx = format!("[Module Name]\n{}\n", module.module_name);
    ctx.push_str(&format!("[Module Description]\n{}\n", module.module_description.as_deref().unwrap_or("N/A")));
    
    match node_type {
        "PRD" | "FSD" | "User Flow" | "IA" | "Wireframe" | "ERD" | "API_Spec" | "TC" => {
            ctx.push_str(&format!("[Core Responsibility]\n{}\n", module.core_responsibility.as_deref().unwrap_or("N/A")));
            ctx.push_str(&format!("[Mapped Epics]\n{}\n", module.mapped_epics.as_deref().unwrap_or("N/A")));
            ctx.push_str(&format!("[Dependencies]\n{}\n", module.dependency_spec.as_deref().unwrap_or("[]")));
        },
        _ => {
            ctx.push_str(&format!("[Dependencies]\n{}\n", module.dependency_spec.as_deref().unwrap_or("[]")));
        }
    }
    ctx
}

pub async fn gather_global_context(
    pool: &SqlitePool,
    project_id: &str,
    node_category: &str,
    node_type: &str,
) -> Result<String, String> {
    let mut global_ctx_str = String::new();

    if node_category == "SAD" {
        let contexts = sqlx::query("SELECT context_type, context_data_json FROM global_context WHERE project_id = ? AND is_deleted = 0")
            .bind(project_id).fetch_all(pool).await.map_err(|e| e.to_string())?;
        for row in contexts {
            let t: String = row.get("context_type");
            let d: String = row.get("context_data_json");
            global_ctx_str.push_str(&format!("\n[{}]\n{}\n", t.to_lowercase(), d));
        }
    } else if node_category == "MODULE" {
        let required_keys = get_required_sad_keys(node_type);
        if !required_keys.is_empty() {
            let query = format!(
                "SELECT context_type, context_data_json FROM global_context WHERE project_id = ? AND context_type IN ({}) AND is_deleted = 0",
                required_keys.iter().map(|_| "?").collect::<Vec<_>>().join(", ")
            );
            let mut q = sqlx::query(&query).bind(project_id);
            for key in required_keys {
                q = q.bind(key);
            }
            let contexts = q.fetch_all(pool).await.map_err(|e| e.to_string())?;
            for row in contexts {
                let t: String = row.get("context_type");
                let d: String = row.get("context_data_json");
                global_ctx_str.push_str(&format!("\n[{}]\n{}\n", t.to_lowercase(), d));
            }
        }
    }
    Ok(global_ctx_str)
}
