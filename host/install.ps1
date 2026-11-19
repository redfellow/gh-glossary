# Registers host\host.mjs as the native messaging host of the gh-glossary extension on Windows, so the
# browser can start it (and only that extension can talk to it). Run it through host\install.cmd.
#
#   host\install.cmd             write the launcher and the host manifest, and register them for
#                                Chrome (plus Edge, Brave and Chromium when they are installed)
#   host\install.cmd uninstall   remove them
#   host\install.cmd status      show where it is registered
#
# Everything goes under the current user (HKCU), so no administrator rights are needed. The launcher
# (host\launcher.cmd, not committed) records where node, gh, git and claude live on this machine.
# Re-run after moving any of them.
param([string]$Action = 'install')
$ErrorActionPreference = 'Stop'

$Name = 'io.github.redfellow.gh_glossary'
$Root = Split-Path -Parent $PSScriptRoot
$Launcher = Join-Path $Root 'host\launcher.cmd'
$Manifest = Join-Path $Root "host\$Name.json"
$ExtId = (Get-Content -Raw (Join-Path $Root 'extension\EXTENSION_ID')).Trim()

# Registry folder of each browser, and the folder that shows it is installed. Chrome is always registered.
$Browsers = @(
  @{ Name = 'Chrome';   Key = 'Software\Google\Chrome';               Dir = $null },
  @{ Name = 'Edge';     Key = 'Software\Microsoft\Edge';              Dir = "$env:LOCALAPPDATA\Microsoft\Edge" },
  @{ Name = 'Brave';    Key = 'Software\BraveSoftware\Brave-Browser'; Dir = "$env:LOCALAPPDATA\BraveSoftware\Brave-Browser" },
  @{ Name = 'Chromium'; Key = 'Software\Chromium';                    Dir = "$env:LOCALAPPDATA\Chromium" }
)
function HostKey($b) { "HKCU:\$($b.Key)\NativeMessagingHosts\$Name" }
function Present($b) { (-not $b.Dir) -or (Test-Path $b.Dir) }

function Need($cmd) {
  $c = Get-Command $cmd -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $c) { Write-Error "$cmd not found on PATH" }
  $c.Source
}
# Text files for the browser and cmd.exe: no byte order mark.
function WriteText($path, $text) { [IO.File]::WriteAllText($path, $text, (New-Object Text.UTF8Encoding $false)) }

switch ($Action) {
  'install' {
    $tools = @{}
    foreach ($c in 'node', 'gh', 'git', 'claude') { $tools[$c] = Need $c }
    foreach ($p in @($Root) + @($tools.Values)) {
      if ($p -match '["%!^&|<>]') { Write-Error "paths must not contain any of `" % ! ^ & | < >: $p" }
    }
    $toolPath = ($tools.Values | ForEach-Object { Split-Path -Parent $_ } | Select-Object -Unique) -join ';'
    $hostScript = Join-Path $Root 'host\host.mjs'
    # @echo off keeps cmd.exe quiet: stdout is the message channel.
    WriteText $Launcher (@(
      '@echo off',
      'rem Written by host\install.ps1. The browser starts this to run the gh-glossary host.',
      "set `"PATH=$toolPath;%PATH%`"",
      "`"$($tools['node'])`" `"$hostScript`" %*",
      ''
    ) -join "`r`n")
    WriteText $Manifest ((@{
      name = $Name
      description = 'GitHub Glossary host: runs Claude to define terms on GitHub pages'
      path = $Launcher
      type = 'stdio'
      allowed_origins = @("chrome-extension://$ExtId/")
    } | ConvertTo-Json) + "`n")
    foreach ($b in $Browsers) {
      if (-not (Present $b)) { continue }
      $k = HostKey $b
      New-Item -Path $k -Force | Out-Null
      Set-Item -Path $k -Value $Manifest
      Write-Output "registered for $($b.Name)"
    }
    Write-Output "extension id: $ExtId"
    Write-Output "Load $(Join-Path $Root 'extension') in chrome://extensions (Developer mode, Load unpacked), or reload it there."
  }
  'uninstall' {
    foreach ($b in $Browsers) {
      $k = HostKey $b
      if (Test-Path $k) { Remove-Item -Path $k -Force; Write-Output "removed $k" }
    }
    foreach ($f in $Launcher, $Manifest) { if (Test-Path $f) { Remove-Item $f -Force } }
  }
  'status' {
    foreach ($b in $Browsers) {
      $k = HostKey $b
      if (Test-Path $k) { Write-Output "registered for $($b.Name): $k -> $((Get-Item $k).GetValue(''))" }
    }
    if (Test-Path $Launcher) { Write-Output "launcher: $Launcher" } else { Write-Output 'launcher missing: run host\install.cmd' }
  }
  default { Write-Error 'usage: host\install.cmd [install|uninstall|status]'; exit 2 }
}
