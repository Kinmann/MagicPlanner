use std::collections::HashSet;
use regex::Regex;

pub fn extract_artifact_ids(json_str: &str) -> HashSet<String> {
    static RE: std::sync::OnceLock<Regex> = std::sync::OnceLock::new();
    let re = RE.get_or_init(|| Regex::new(r"(?i)\b(?:[A-Z0-9_]+:[A-Z0-9_]+:)?[A-Z]{2,}-\w+\b").unwrap());
    re.find_iter(json_str)
        .map(|m| m.as_str().to_string())
        .collect()
}

pub fn extract_canonical_ids(json_str: &str, module_id: &str, node_type: &str) -> HashSet<String> {
    let raw_ids = extract_artifact_ids(json_str);
    let mid_up = module_id.to_uppercase();
    let type_up = node_type.to_uppercase();

    raw_ids.into_iter().map(|id| {
        if id.contains(':') {
            id.to_uppercase()
        } else {
            format!("{}:{}:{}", mid_up, type_up, id.to_uppercase())
        }
    }).collect()
}

fn main() {
    let test_cases = vec![
        // (json, module, type, expected)
        ("{\"id\": \"FUNC-001\"}", "auth", "fsd", vec!["AUTH:FSD:FUNC-001"]),
        ("{\"ref\": \"auth:fsd:FUNC-001\"}", "user", "api", vec!["AUTH:FSD:FUNC-001"]),
        ("{\"ref\": \"AUTH:FSD:FUNC-001\"}", "user", "api", vec!["AUTH:FSD:FUNC-001"]),
        ("{\"id\": \"FUNC-001\", \"ref\": \"USER:API:API-001\"}", "auth", "fsd", vec!["AUTH:FSD:FUNC-001", "USER:API:API-001"]),
    ];

    for (json, mid, ntype, expected) in test_cases {
        let result = extract_canonical_ids(json, mid, ntype);
        let expected_set: HashSet<String> = expected.into_iter().map(|s| s.to_string()).collect();
        assert_eq!(result, expected_set, "Failed for JSON: {}", json);
        println!("PASSED: {} -> {:?}", json, result);
    }
    
    println!("\nAll ID normalization tests passed!");
}
