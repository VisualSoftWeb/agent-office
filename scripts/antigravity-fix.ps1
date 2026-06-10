param(
    [switch]$Uninstall
)

$antigravityPath = "$env:LOCALAPPDATA\Programs\Antigravity IDE\Antigravity IDE.exe"
$fixDir = "$env:LOCALAPPDATA\Programs\antigravity"
$pemFile = "$fixDir\avg-root-ca.pem"
$launcherCmd = "$fixDir\Antigravity-IDE.cmd"

if ($Uninstall) {
    Write-Host "Removendo fix do Antigravity..."
    if (Test-Path $launcherCmd) { Remove-Item $launcherCmd -Force }
    if (Test-Path $pemFile) { Remove-Item $pemFile -Force }
    if ((Get-ChildItem $fixDir -ErrorAction SilentlyContinue).Count -eq 0) { Remove-Item $fixDir -Force }
    Write-Host "Fix removido. Use o atalho original para iniciar o Antigravity."
    return
}

# Ensure fix directory exists
if (-not (Test-Path $fixDir)) { New-Item -ItemType Directory -Path $fixDir -Force | Out-Null }

# Export AVG Root CA certificate to PEM
$avgCert = Get-ChildItem -Path 'Cert:\CurrentUser\Root' | Where-Object { $_.Subject -like '*AVG*' }
if (-not $avgCert) { $avgCert = Get-ChildItem -Path 'Cert:\LocalMachine\Root' | Where-Object { $_.Subject -like '*AVG*' } }

if ($avgCert) {
    $b64 = [Convert]::ToBase64String($avgCert.RawData)
    $pem = "-----BEGIN CERTIFICATE-----`n"
    for ($i = 0; $i -lt $b64.Length; $i += 64) {
        if ($i + 64 -lt $b64.Length) { $pem += $b64.Substring($i, 64) + "`n" }
        else { $pem += $b64.Substring($i) + "`n" }
    }
    $pem += "-----END CERTIFICATE-----`n"
    Set-Content -Path $pemFile -Value $pem -Encoding ASCII
    Write-Host "Certificado AVG exportado para: $pemFile"
} else {
    Write-Host "AVISO: Certificado AVG Web/Mail Shield Root nao encontrado."
    Write-Host "Sera usado apenas o modo NODE_TLS_REJECT_UNAUTHORIZED=0 (menos seguro)."
}

# Create launcher CMD script
$lines = @(
    '@echo off',
    'setlocal',
    'set "NODE_TLS_REJECT_UNAUTHORIZED=0"'
)
if ($avgCert) {
    $lines += 'set "NODE_EXTRA_CA_CERTS=%LOCALAPPDATA%\Programs\antigravity\avg-root-ca.pem"'
}
$lines += @(
    'start "" "%LOCALAPPDATA%\Programs\Antigravity IDE\Antigravity IDE.exe"',
    'endlocal'
)
Set-Content -Path $launcherCmd -Value ($lines -join "`r`n") -Encoding ASCII

Write-Host "`n=== FIX CRIADO ==="
Write-Host "Atalho: $launcherCmd"
Write-Host "`nComo usar:"
Write-Host "1. Execute o atalho: $launcherCmd"
Write-Host "   (ou clique duas vezes no explorer)"
Write-Host "`nAlternativa manual (uma vez):"
Write-Host "   `$env:NODE_TLS_REJECT_UNAUTHORIZED=0"
Write-Host "   & `"$antigravityPath`""
Write-Host "`nPara reverter:"
Write-Host "   powershell -File ""$PSCommandPath"" -Uninstall"
Write-Host "`nRecomendacao adicional:"
Write-Host "Se voce usa AVG Antivirus, considere desabilitar a inspecao SSL:"
Write-Host "  AVG > Menu > Configuracoes > Protecao > Firewall > Inspecao SSL"
Write-Host "  (ou equivalente na sua versao do AVG)"
