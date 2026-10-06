<#
.SYNOPSIS
  Builds Ponto for Windows and/or Android with the updater signing key of THIS project only.

.DESCRIPTION
  Runs the checks, then the Tauri build. The signing key is passed to the build process through
  TAURI_SIGNING_PRIVATE_KEY (set to a path, the key is never read by this script) and the password
  is asked interactively. Both exist only in the environment of the build process, so the keys
  of other projects set in your own environment are neither used nor modified.

.PARAMETER Target
  windows (default), android, or all.

.PARAMETER KeyPath
  Path to Ponto's updater private key (the file created by `pnpm tauri signer generate -w`).

.PARAMETER SkipChecks
  Skips `pnpm lint` and `pnpm typecheck`.

.PARAMETER Notes
  Release notes written in latest.json (Windows builds only). Empty by default.

.EXAMPLE
  ./scripts/build-release.ps1
  ./scripts/build-release.ps1 -Target all -KeyPath D:\keys\ponto.key -Notes 'Fix Lara login'
#>
[CmdletBinding()]
param(
  [ValidateSet('windows', 'android', 'all')]
  [string]$Target = 'windows',
  [string]$KeyPath = (Join-Path $HOME '.tauri\ponto.key'),
  [string]$Notes = '',
  [switch]$SkipChecks
)

$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

# Runs `pnpm <args>` in a child process whose environment is extended with $ExtraEnv.
# Nothing is written to this session's environment.
function Invoke-Pnpm {
  param([string[]]$Arguments, [hashtable]$ExtraEnv = @{})
  $psi = [System.Diagnostics.ProcessStartInfo]::new('cmd.exe', '/c pnpm ' + ($Arguments -join ' '))
  $psi.UseShellExecute = $false
  foreach ($name in $ExtraEnv.Keys) { $psi.Environment[$name] = [string]$ExtraEnv[$name] }
  $process = [System.Diagnostics.Process]::Start($psi)
  $process.WaitForExit()
  if ($process.ExitCode -ne 0) { throw "pnpm $($Arguments -join ' ') a échoué (code $($process.ExitCode))." }
}

$needsSigning = $Target -in 'windows', 'all'
$signingEnv = @{}

if ($needsSigning) {
  if (-not (Test-Path -LiteralPath $KeyPath -PathType Leaf)) {
    throw "Clé de signature introuvable : $KeyPath (utilisez -KeyPath)."
  }
  $secure = Read-Host 'Mot de passe de la clé de signature de Ponto' -AsSecureString
  $password = [System.Net.NetworkCredential]::new('', $secure).Password
  # Tauri 2 only reads TAURI_SIGNING_PRIVATE_KEY (the key's content or a path to it);
  # TAURI_SIGNING_PRIVATE_KEY_PATH is ignored by `tauri build`. A path keeps the key unread here.
  $signingEnv = @{
    TAURI_SIGNING_PRIVATE_KEY          = (Resolve-Path -LiteralPath $KeyPath).Path
    TAURI_SIGNING_PRIVATE_KEY_PASSWORD = $password
  }
}

if (-not $SkipChecks) {
  Write-Host '== Vérifications (lint, typecheck) ==' -ForegroundColor Cyan
  Invoke-Pnpm @('lint')
  Invoke-Pnpm @('typecheck')
}

# Writes latest.json (the updater manifest) next to the NSIS installer. The signature is the
# content of the .sig file; the download URL points at the asset of this version's GitHub release.
function New-UpdaterManifest {
  param([string]$Notes)
  $conf = Get-Content -LiteralPath 'src-tauri/tauri.conf.json' -Raw | ConvertFrom-Json
  $version = $conf.version
  $installer = Join-Path 'src-tauri/target/release/bundle/nsis' "$($conf.productName)_${version}_x64-setup.exe"
  $sigPath = "$installer.sig"
  foreach ($path in $installer, $sigPath) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Fichier introuvable : $path" }
  }
  $endpoint = $conf.plugins.updater.endpoints[0]
  $releaseBase = $endpoint -replace '/releases/latest/download/[^/]+$', "/releases/download/v$version"
  if ($releaseBase -eq $endpoint) { throw "Endpoint de l'updater inattendu : $endpoint" }
  $manifest = [ordered]@{
    version  = $version
    notes    = $Notes
    pub_date = (Get-Date).ToUniversalTime().ToString("yyyy-MM-dd'T'HH:mm:ss'Z'")
    platforms = [ordered]@{
      'windows-x86_64' = [ordered]@{
        signature = (Get-Content -LiteralPath $sigPath -Raw).Trim()
        url       = "$releaseBase/$(Split-Path $installer -Leaf)"
      }
    }
  }
  $manifestPath = Join-Path (Split-Path $installer -Parent) 'latest.json'
  $json = $manifest | ConvertTo-Json -Depth 5
  [System.IO.File]::WriteAllText((Join-Path (Get-Location) $manifestPath), $json + "`n", [System.Text.UTF8Encoding]::new($false))
  Write-Host "latest.json généré : $manifestPath" -ForegroundColor Green
}

if ($Target -in 'windows', 'all') {
  Write-Host '== Compilation Windows ==' -ForegroundColor Cyan
  Invoke-Pnpm @('tauri:build') $signingEnv
  New-UpdaterManifest -Notes $Notes
}

if ($Target -in 'android', 'all') {
  Write-Host '== Compilation Android (APK aarch64) ==' -ForegroundColor Cyan
  Invoke-Pnpm @('tauri:android:build')
}

Write-Host 'Terminé.' -ForegroundColor Green
