$path = 'src\commands.rs'
$content = Get-Content -Path $path
$content = $content.Replace('sad_node.node_state != "COMPLETED"', 'sad_node.node_state != "COMPLETED" && sad_node.node_state != "STALE"')
$content = $content.Replace('node.node_state != "COMPLETED"', 'node.node_state != "COMPLETED" && node.node_state != "STALE"')
$content | Set-Content -Path $path
