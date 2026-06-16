Set-Location D:\qwenproxy-main
$env:NODE_TLS_REJECT_UNAUTHORIZED = "0"
$proc = Start-Process -NoNewWindow -PassThru -FilePath "npx" -ArgumentList "tsx", "src/index.ts"
Start-Sleep -Seconds 55
try {
    $h = Invoke-RestMethod -Uri "http://localhost:3000/health" -TimeoutSec 10
    Write-Host "HEALTH: $($h.status)"
} catch {
    Write-Host "HEALTH FAILED: $($_.Exception.Message)"
}
try {
    $m = Invoke-RestMethod -Uri "http://localhost:3000/v1/models" -TimeoutSec 15
    Write-Host "MODELS COUNT: $($m.data.Count)"
    $m.data | ForEach-Object { Write-Host "  - $($_.id)" }
} catch {
    Write-Host "MODELS FAILED: $($_.Exception.Message)"
}
Stop-Process -Id $proc.Id -Force
