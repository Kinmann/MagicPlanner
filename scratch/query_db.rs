use rusqlite::{Connection, Result};

fn main() -> Result<()> {
    let db_path = "C:/Users/jisus/AppData/Roaming/com.gamedex02.magicplanner/magic_planner.db";
    let conn = Connection::open(db_path)?;

    // 1. Get Project ID
    let project_name = "돈 많이 버는 앱";
    let mut stmt = conn.prepare("SELECT project_id FROM project WHERE project_name = ? AND is_deleted = 0")?;
    let project_id: String = stmt.query_row([project_name], |row| row.get(0))?;
    println!("PROJECT_ID: {}", project_id);

    // 2. Get Module Context for MOD-OPS
    let module_name = "MOD-OPS";
    let mut stmt = conn.prepare("SELECT module_id, module_description, core_responsibility, mapped_epics FROM local_module WHERE project_id = ? AND module_name = ? AND is_deleted = 0")?;
    let (module_id, desc, resp, epics): (String, String, String, String) = stmt.query_row([&project_id, module_name], |row| {
        Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
    })?;
    println!("MODULE_ID: {}", module_id);
    println!("MODULE_DESC: {}", desc);
    println!("MODULE_RESP: {}", resp);
    println!("MODULE_EPICS: {}", epics);

    // 3. Get Global Context
    let mut stmt = conn.prepare("SELECT context_type, context_data_json FROM global_context WHERE project_id = ? AND is_deleted = 0")?;
    let contexts = stmt.query_map([&project_id], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;

    for ctx in contexts {
        let (ctype, cdata) = ctx?;
        println!("GLOBAL_CTX: {} -> {}", ctype, cdata);
    }

    Ok(())
}
