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

.PARAMETER Merge
  latest.json built on Linux (build-release.sh); its platforms are kept in the Windows one.

.PARAMETER SkipChecks
  Skips `pnpm lint` and `pnpm typecheck`.

.PARAMETER Notes
  Release notes written in latest.json (Windows builds only). Empty by default.

.EXAMPLE
  ./build-release.ps1
  ./build-release.ps1 -Target all -KeyPath D:\keys\ponto.key -Notes 'Fix Lara login'
#>
[CmdletBinding()]
param(
  [ValidateSet('windows', 'android', 'all')]
  [string]$Target = 'windows',
  [string]$KeyPath = (Join-Path $HOME '.tauri\ponto.key'),
  [string]$Notes = '',
  [string]$Merge = '',
  [switch]$SkipChecks
)

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

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

# Writes latest.json (the updater manifest) next to the NSIS installer, through the script shared
# with the Linux build. The signature is the content of the .sig file; the download URL points at
# the asset of this version's GitHub release. Pass -Merge to keep the platforms of a latest.json
# built on Linux.
function New-UpdaterManifest {
  param([string]$Notes)
  $conf = Get-Content -LiteralPath 'src-tauri/tauri.conf.json' -Raw | ConvertFrom-Json
  $installer = Join-Path 'src-tauri/target/release/bundle/nsis' "$($conf.productName)_$($conf.version)_x64-setup.exe"
  $arguments = @('scripts/updater-manifest.js', '--platform', 'windows-x86_64', '--file', $installer,
    '--out', (Join-Path (Split-Path $installer -Parent) 'latest.json'), '--notes', $Notes)
  if ($Merge) { $arguments += @('--merge', $Merge) }
  & node @arguments
  if ($LASTEXITCODE -ne 0) { throw "La génération de latest.json a échoué (code $LASTEXITCODE)." }
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
