use std::path::PathBuf;
use tauri::Manager;

/// 프롬프트 파일 디렉토리 경로를 반환합니다.
/// Debug 모드에서는 프로젝트 루트의 src-tauri/prompts를 탐색하고,
/// Release 모드에서는 Tauri 리소스 디렉토리를 사용합니다.
pub fn get_prompts_dir(app_handle: &tauri::AppHandle) -> PathBuf {
    #[cfg(debug_assertions)]
    {
        // 개발 모드: target 하위에서 상위로 올라가며 prompts 디렉토리 탐색
        if let Ok(cwd) = std::env::current_dir() {
            let mut current = Some(cwd.as_path());
            while let Some(path) = current {
                let check_paths = vec![
                    path.join("src-tauri").join("prompts"),
                    path.join("prompts"),
                ];
                for p in check_paths {
                    if p.exists() {
                        return p;
                    }
                }
                current = path.parent();
            }
        }
    }

    // 릴리스 모드 또는 탐색 실패 시 Tauri 리소스 디렉토리 사용
    if let Ok(resource_dir) = app_handle.path().resource_dir() {
        let p = resource_dir.join("prompts");
        if p.exists() {
            return p;
        }
    }

    // 최종 폴백
    let fallback = app_handle.path().resource_dir().unwrap_or_default().join("prompts");
    println!(">>> [DEBUG] get_prompts_dir: No prompts directory found. Fallback to: {:?}", fallback);
    fallback
}
