$path = 'src\commands.rs'
$content = Get-Content -Path $path
# Fix the double injection and 'node' not found error
$content = $content -replace '&& node.node_state != "STALE" && sad_node.node_state != "STALE"', '&& sad_node.node_state != "STALE"'
# And ensure all STALE checks are clean
$content = $content -replace 'sad_node.node_state != "COMPLETED" && sad_node.node_state != "STALE" && node.node_state != "STALE"', 'sad_node.node_state != "COMPLETED" && sad_node.node_state != "STALE"'
$content | Set-Content -Path $path
