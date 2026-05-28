param(
  [string]$SourceCookiesFile,
  [string]$LocalCookiesFile,
  [string]$DropletHost = $env:STUPIDER_DROPLET_HOST,
  [string]$DropletUser = $env:STUPIDER_DROPLET_USER,
  [string]$RemoteAppDir = $env:STUPIDER_REMOTE_APP_DIR,
  [string]$RemoteCookiesFile = $env:STUPIDER_REMOTE_COOKIES_FILE,
  [switch]$RestartService
)

$ErrorActionPreference = "Stop"

function Read-DotEnvValue {
  param([string]$Name)

  if (-not (Test-Path ".env")) {
    return $null
  }

  $line = Get-Content ".env" |
    Where-Object { $_ -match "^\s*$([regex]::Escape($Name))\s*=" } |
    Select-Object -First 1

  if (-not $line) {
    return $null
  }

  return ($line -replace "^\s*$([regex]::Escape($Name))\s*=\s*", "").Trim().Trim('"').Trim("'")
}

function Require-Command {
  param([string]$Name)

  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "$Name was not found on PATH."
  }
}

function Escape-RemoteSingleQuoted {
  param([string]$Value)
  return $Value.Replace("'", "'\''")
}

if (-not $DropletUser) {
  $DropletUser = Read-DotEnvValue "STUPIDER_DROPLET_USER"
}

if (-not $DropletUser) {
  $DropletUser = "root"
}

if (-not $RemoteAppDir) {
  $RemoteAppDir = Read-DotEnvValue "STUPIDER_REMOTE_APP_DIR"
}

if (-not $RemoteAppDir) {
  $RemoteAppDir = "/opt/stupider-discord-bot"
}

if (-not $RemoteCookiesFile) {
  $RemoteCookiesFile = Read-DotEnvValue "STUPIDER_REMOTE_COOKIES_FILE"
}

if (-not $RemoteCookiesFile) {
  $RemoteCookiesFile = "$RemoteAppDir/youtube.cookies.txt"
}

if (-not $LocalCookiesFile) {
  $LocalCookiesFile = Read-DotEnvValue "YOUTUBE_COOKIES_FILE"
}

if (-not $DropletHost) {
  $DropletHost = Read-DotEnvValue "STUPIDER_DROPLET_HOST"
}

if (-not $SourceCookiesFile) {
  $SourceCookiesFile = $LocalCookiesFile
}

if (-not $SourceCookiesFile) {
  throw "Set -SourceCookiesFile or YOUTUBE_COOKIES_FILE in .env."
}

if (-not (Test-Path $SourceCookiesFile)) {
  throw "Cookie file was not found: $SourceCookiesFile"
}

$sourceResolved = (Resolve-Path $SourceCookiesFile).Path
$localResolved = if ($LocalCookiesFile -and (Test-Path $LocalCookiesFile)) {
  (Resolve-Path $LocalCookiesFile).Path
} else {
  $null
}

if ($LocalCookiesFile -and ($sourceResolved -ne $localResolved)) {
  $localParent = Split-Path -Parent $LocalCookiesFile
  if ($localParent) {
    New-Item -ItemType Directory -Path $localParent -Force | Out-Null
  }
  Copy-Item -LiteralPath $SourceCookiesFile -Destination $LocalCookiesFile -Force
  Write-Host "Updated local cookies file: $LocalCookiesFile"
}

if (-not $DropletHost) {
  Write-Host "No droplet host configured. Set STUPIDER_DROPLET_HOST or pass -DropletHost to sync remote cookies."
  exit 0
}

Require-Command "scp"
Require-Command "ssh"

$remote = "${DropletUser}@${DropletHost}"
$remoteTarget = "${remote}:${RemoteCookiesFile}"
$remoteCookiesQuoted = Escape-RemoteSingleQuoted $RemoteCookiesFile

& scp $SourceCookiesFile $remoteTarget
if ($LASTEXITCODE -ne 0) {
  throw "scp failed with exit code $LASTEXITCODE."
}

$remoteCommand = "chmod 600 '$remoteCookiesQuoted'"

if ($RestartService) {
  $remoteCommand = "$remoteCommand && systemctl restart stupider-discord-bot"
}

& ssh $remote $remoteCommand
if ($LASTEXITCODE -ne 0) {
  throw "ssh command failed with exit code $LASTEXITCODE."
}

Write-Host "Synced cookies to ${remoteTarget}"
