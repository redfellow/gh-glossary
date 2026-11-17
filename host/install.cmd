@echo off
rem Registers the gh-glossary host on Windows. See host\install.ps1.
rem   host\install.cmd [install|uninstall|status]
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" %*
exit /b %ERRORLEVEL%
