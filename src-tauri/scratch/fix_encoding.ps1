$path = 'src\commands.rs'
$content = Get-Content -Path $path
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllLines($path, $content, $utf8NoBom)
