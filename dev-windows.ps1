# The `e[..m escape sequences below require PowerShell 7+ (pwsh) — Windows
# PowerShell 5.1 doesn't understand `e and prints it literally. Relaunch under
# pwsh if needed, WITHOUT elevating: this is only about the interpreter, not
# about admin rights (see Invoke-Elevated for the operations that need those).
if ($PSVersionTable.PSEdition -ne 'Core') {
  if (-not (Get-Command pwsh -ErrorAction SilentlyContinue)) {
    Write-Output "This script requires PowerShell 7+ (pwsh). Install it from https://aka.ms/powershell"
    exit 1
  }
  & pwsh -NoProfile -File $MyInvocation.MyCommand.Path
  exit $LASTEXITCODE
}

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$TargetDir = Join-Path $ProjectRoot "src-tauri\target"

function Write-ColorOutput {
  param([string]$Message, [string]$ForegroundColor = '')
  $reset = "`e[0m"
  $color = switch ($ForegroundColor) {
    'Red'      { "`e[31m" }
    'Green'    { "`e[32m" }
    'Yellow'   { "`e[33m" }
    'Cyan'     { "`e[36m" }
    'DarkCyan' { "`e[36m" }
    'DarkGray' { "`e[90m" }
    default { '' }
  }
  if ($color) {
    Write-Output "${color}${Message}${reset}"
  } else {
    Write-Output $Message
  }
}

function Write-Title($text) {
  Clear-Host
  Write-ColorOutput "====================================" DarkCyan
  Write-ColorOutput " $text" Cyan
  Write-ColorOutput "====================================" DarkCyan
}

function Wait-UserInput {
  Read-Host "Press Enter to continue"
}

function Test-IsAdmin {
  ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# Elevates only the given command, not this whole session — pnpm install / tauri dev
# stay unprivileged so a compromised dependency can't inherit admin rights.
# Runs $Command in a child pwsh process rather than Invoke-Expression, even
# on the already-admin path — same mechanism as the elevated branch below,
# just without -Verb RunAs, so there's no in-session string-to-code eval.
function Invoke-Elevated([string]$Command) {
  if (Test-IsAdmin) {
    & pwsh -NoProfile -Command $Command
  } else {
    Write-ColorOutput "Requesting admin rights for this operation only..." Yellow
    Start-Process pwsh -Verb RunAs -ArgumentList "-NoProfile", "-Command", $Command -Wait
  }
}

function Install-Dependencies {
  Write-ColorOutput "Installing dependencies..." Yellow
  pnpm install --ignore-scripts
}

function Clear-Port {
  Write-ColorOutput "Clearing port 5173..." Yellow

  $procs = Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue

  foreach ($p in $procs) {
    try {
      Stop-Process -Id $p.OwningProcess -Force
      Write-ColorOutput "Process stopped: $($p.OwningProcess)" Green
    } catch {
      Write-ColorOutput "Error on $($p.OwningProcess)" Red
    }
  }

  if (-not $procs) {
    Write-ColorOutput "Port already free" Green
  }
}

# True when the path, or anything under it, is a junction or symbolic link. The target folder is
# writable by any build script, so the elevated cleanup below must never follow a link planted there.
function Test-HasReparsePoint([string]$Path) {
  $root = Get-Item -LiteralPath $Path -Force
  if ($root.Attributes -band [IO.FileAttributes]::ReparsePoint) { return $true }
  $link = Get-ChildItem -LiteralPath $Path -Recurse -Force -Attributes ReparsePoint -ErrorAction SilentlyContinue |
    Select-Object -First 1
  return [bool]$link
}

function Clear-IncrementalCache {
  Write-Title "Clearing incremental Rust cache"

  $incrementalDir = Join-Path $TargetDir "debug\incremental"

  if (-not (Test-Path -LiteralPath $incrementalDir)) {
    Write-ColorOutput "No incremental cache found." Green
    return
  }

  if (Test-HasReparsePoint $incrementalDir) {
    Write-ColorOutput "Refusing to clean $incrementalDir : it contains a junction or symbolic link." Red
    Write-ColorOutput "Inspect it and delete it manually." Red
    return
  }

  # Files created by cargo belong to the current user, so no admin rights are needed.
  Remove-Item -LiteralPath $incrementalDir -Recurse -Force -ErrorAction SilentlyContinue
  if (-not (Test-Path -LiteralPath $incrementalDir)) {
    Write-ColorOutput "Cache removed." Green
    return
  }

  # Leftovers (e.g. files created by an earlier elevated build): take ownership, only for this command.
  Write-ColorOutput "Taking ownership and removing $incrementalDir ..." Yellow
  $cmd = "takeown /f `"$incrementalDir`" /r /d o; icacls `"$incrementalDir`" /grant *S-1-5-32-544:F /t /L; Remove-Item -LiteralPath `"$incrementalDir`" -Recurse -Force -ErrorAction SilentlyContinue"
  Invoke-Elevated $cmd
  Write-ColorOutput "Cache removed." Green
}

function Add-DefenderExclusion {
  Write-Title "Windows Defender exclusion"

  Write-ColorOutput "This excludes '$TargetDir' from Windows Defender scanning to speed up Rust builds." Yellow
  Write-ColorOutput "WARNING: any file placed there afterwards (e.g. via a compromised cargo/npm" Red
  Write-ColorOutput "dependency) will NOT be scanned until you remove the exclusion yourself." Red
  $confirm = Read-Host "Continue? (y/N)"
  if ($confirm -ne 'y') {
    Write-ColorOutput "Cancelled." Yellow
    return
  }

  $cmd = "Add-MpPreference -ExclusionPath `"$TargetDir`" -ErrorAction Stop"
  Invoke-Elevated $cmd
  Write-ColorOutput "Exclusion added." Green
}

function Start-Tauri {
  Write-ColorOutput "Launching Tauri..." Cyan
  $env:CARGO_INCREMENTAL = "0"
  pnpm tauri dev
  $env:CARGO_INCREMENTAL = $null
}

# ================= MENU =================

while ($true) {
  Write-Title "Windows Dev Menu"

  Write-Output "[1] Install dependencies"
  Write-Output "[2] Clean port 5173"
  Write-Output "[3] Launch Tauri"
  Write-Output "[4] Clean incremental Rust cache"
  Write-Output "[5] Exclude target/ from Windows Defender"
  Write-Output "[0] Quit"

  $choice = Read-Host "Choice"

  switch ($choice) {
    "1" {
      Install-Dependencies
      Wait-UserInput
    }
    "2" {
      Clear-Port
      Wait-UserInput
    }
    "3" {
      Start-Tauri
      Wait-UserInput
    }
    "4" {
      Clear-IncrementalCache
      Wait-UserInput
    }
    "5" {
      Add-DefenderExclusion
      Wait-UserInput
    }
    "0" {
      [Environment]::Exit(0)
    }
  }
}
