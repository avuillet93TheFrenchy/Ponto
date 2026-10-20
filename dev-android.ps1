# The `e[..m escape sequences below require PowerShell 7+ (pwsh) — Windows
# PowerShell 5.1 doesn't understand `e and prints it literally. Relaunch under
# pwsh if needed; this is purely about the interpreter, no elevation involved.
if ($PSVersionTable.PSEdition -ne 'Core') {
  if (-not (Get-Command pwsh -ErrorAction SilentlyContinue)) {
    Write-Output "This script requires PowerShell 7+ (pwsh). Install it from https://aka.ms/powershell"
    exit 1
  }
  & pwsh -NoProfile -File $MyInvocation.MyCommand.Path
  exit $LASTEXITCODE
}

# Force adb's internal mDNS implementation (OpenScreen). The Windows mDNS stack
# triggers 'protocol fault (couldn't read status message)' on Android 11+ pairing.
$env:ADB_MDNS_OPENSCREEN = "1"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $projectRoot

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

if (-not $env:ANDROID_HOME) {
  Write-ColorOutput "ANDROID_HOME is not set." Red
  Write-ColorOutput "Set it with: setx ANDROID_HOME `"C:\Users\$env:USERNAME\AppData\Local\Android\Sdk`"" Yellow
  Read-Host "Press Enter to exit"
  exit 1
}

$adb = Join-Path $env:ANDROID_HOME 'platform-tools\adb.exe'
if (-not (Test-Path $adb)) {
  Write-ColorOutput "adb.exe not found: $adb" Red
  Read-Host "Press Enter to exit"
  exit 1
}

# Restart the adb server so it picks up ADB_MDNS_OPENSCREEN. No-op connection-wise
# if the server is already running with the right env var.
function Restart-AdbServer {
  & $adb kill-server | Out-Null
  & $adb start-server | Out-Null
}

function Write-Title($text) {
  Clear-Host
  Write-ColorOutput "====================================" DarkCyan
  Write-ColorOutput " $text" Cyan
  Write-ColorOutput "====================================" DarkCyan
}

function Wait-UserInput {
  Write-Output ""
  Read-Host "Press Enter to continue"
}

function Get-AndroidDevices {
  # Skip the "List of devices attached" header line
  $lines = & $adb devices 2>&1 | Select-Object -Skip 1
  $devices = @()
  foreach ($line in $lines) {
    # Match only entries whose status is exactly "device" (not "unauthorized", "offline", "no permissions"...)
    if ($line -match '^\s*(\S+)\s+device\s*$') {
      $id = $Matches[1]
      # `pnpm` is a .cmd shim on Windows, so the id ends up as a cmd.exe argument: only accept
      # what a real serial or IP:PORT contains, never shell metacharacters (& | ^ % ...).
      if ($id -notmatch '^[A-Za-z0-9._:\-]+$') {
        Write-ColorOutput "Ignoring device with an unexpected identifier." Yellow | Out-Host
        continue
      }
      $type = if ($id -match ':') { 'WiFi' } else { 'USB' }
      $devices += [PSCustomObject]@{ Id = $id; Type = $type }
    }
  }
  return ,$devices
}

function Show-DeviceList {
  Write-Title "ADB devices"
  $raw = & $adb devices -l 2>&1
  Write-Output ($raw -join "`n")
  Wait-UserInput
}

# Accepts "IP:PORT" or a bare "IP" (then prompts for the port separately).
# Returns the normalized "IP:PORT" string, or $null if the input is invalid.
function Read-IpPort([string]$Prompt, [string]$PortPrompt) {
  $value = (Read-Host $Prompt).Trim()
  if ($value -match '^\d+\.\d+\.\d+\.\d+$') {
    $port = (Read-Host $PortPrompt).Trim()
    $value = "${value}:${port}"
  }
  if (-not ($value -match '^\d+\.\d+\.\d+\.\d+:\d+$')) {
    # Out-Host: Write-ColorOutput emits to the pipeline, which would pollute the return value
    Write-ColorOutput "Invalid format: expected IP:PORT (e.g. 192.168.1.14:37215)" Red | Out-Host
    return $null
  }
  return $value
}

function Invoke-WifiPair {
  Write-Title "Wi-Fi pairing (Android 11+)"
  Write-ColorOutput "IMPORTANT:" Yellow
  Write-ColorOutput "  - Keep the 'Pair device with pairing code' window OPEN on the phone" Yellow
  Write-Output "    for the entire operation. Closing it invalidates the port and"
  Write-Output "    pairing will fail with 'protocol fault'."
  Write-ColorOutput "  - The pairing port changes every time the window is reopened." Yellow
  Write-Output ""
  Write-Output "On the phone:"
  Write-Output "  Settings > Developer options > Wireless debugging"
  Write-Output "  > 'Pair device with pairing code'"
  Write-Output ""
  $pairTarget = Read-IpPort "IP:PORT_PAIRING (shown at the top of the window)" "Pairing port (number after ':' in the pairing window)"
  if (-not $pairTarget) { Wait-UserInput; return }
  $pairCode = Read-Host "Pairing code (6 digits shown below the port)"
  # Restart adb to make sure ADB_MDNS_OPENSCREEN is active on the server side
  Restart-AdbServer
  Write-ColorOutput "adb pair $pairTarget" DarkGray
  & $adb pair $pairTarget $pairCode
  if ($LASTEXITCODE -ne 0) {
    Write-Output ""
    Write-ColorOutput "Pairing failed. Check:" Red
    Write-Output "  1. Is the pairing window still open on the phone?"
    Write-Output "  2. Is the phone's IP on the same network as this PC?"
    Write-Output "  3. Did you use the pairing port (not the connection port)?"
    Write-Output "  4. Is the 6-digit code correct?"
  }
  Wait-UserInput
}

function Invoke-WifiConnect {
  Write-Title "Wi-Fi connect"
  Write-ColorOutput "On the phone: Wireless debugging > IP address & port" Yellow
  Write-Output "(On Android 11+, the connection port differs from the pairing port.)"
  Write-Output ""
  $target = Read-IpPort "IP:PORT_CONNECT (e.g. 192.168.1.10:39876)" "Connection port (from 'IP address & port')"
  if (-not $target) { Wait-UserInput; return }
  Write-ColorOutput "adb connect $target" DarkGray
  & $adb connect $target
  Wait-UserInput
}

function Select-Device {
  $devices = Get-AndroidDevices
  if ($devices.Count -eq 0) {
    Write-ColorOutput "No device in 'device' state." Red
    Write-ColorOutput "Diagnostics:" Yellow
    Write-Output "  - USB: cable plugged in? USB debugging enabled? Authorization granted (popup)?"
    Write-Output "  - Wi-Fi: use menu [2] (pair) then [3] (connect) for Android 11+"
    Write-Output ""
    & $adb devices
    Wait-UserInput
    return $null
  }
  Write-ColorOutput "Choose a device:" Cyan
  for ($i = 0; $i -lt $devices.Count; $i++) {
    Write-Output "[$i] $($devices[$i].Id) [$($devices[$i].Type)]"
  }
  $choice = Read-Host "Number"
  if (-not ($choice -match '^\d+$') -or [int]$choice -ge $devices.Count) {
    Write-ColorOutput "Invalid choice" Red
    Wait-UserInput
    return $null
  }
  return $devices[[int]$choice]
}

function Start-Tauri {
  param(
    [string]$DeviceId,
    [switch]$AutoDetect
  )
  Write-Title "Launching Tauri Android"
  if ($AutoDetect) {
    Write-ColorOutput "Command: pnpm tauri android dev (first available device)" DarkGray
    & pnpm tauri android dev
  } else {
    Write-ColorOutput "Command: pnpm tauri android dev `"$DeviceId`"" DarkGray
    & pnpm tauri android dev $DeviceId
  }
  Write-Output ""
  Write-ColorOutput "[Tauri exited - code $LASTEXITCODE]" Yellow
  Wait-UserInput
}

# ================= MENU =================

while ($true) {
  Write-Title "Android Dev Menu  ($projectRoot)"

  Write-Output "[1] List ADB devices"
  Write-Output "[2] Wi-Fi pair (Android 11+)"
  Write-Output "[3] Wi-Fi connect (after pairing, or Android <= 10)"
  Write-Output "[4] Launch Tauri on a specific device"
  Write-Output "[5] Launch Tauri (first detected device/emulator)"
  Write-Output "[6] Disconnect all (adb disconnect)"
  Write-Output "[0] Quit"
  Write-Output ""

  $choice = Read-Host "Choice"
  switch ($choice) {
    '1' { Show-DeviceList }
    '2' { Invoke-WifiPair }
    '3' { Invoke-WifiConnect }
    '4' {
      $device = Select-Device
      if ($device) { Start-Tauri -DeviceId $device.Id }
    }
    '5' { Start-Tauri -AutoDetect }
    '6' {
      & $adb disconnect
      Wait-UserInput
    }
    '0' { [Environment]::Exit(0) }
    default {
      Write-ColorOutput "Invalid choice" Red
      Start-Sleep -Seconds 1
    }
  }
}
