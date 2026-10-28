@echo off
setlocal
chcp 65001 >nul
title Jarvis (servidor)
rem Liga o Jarvis no PC em http://127.0.0.1:8080.
rem O Tailscale entrega esse endereço com HTTPS para o celular e para o próprio PC.

set "RAIZ=%~dp0.."
set "PHPEXE="
for /d %%D in ("%LOCALAPPDATA%\Microsoft\WinGet\Packages\PHP.PHP.8.*") do if exist "%%D\php.exe" set "PHPEXE=%%D\php.exe"
if not defined PHPEXE if exist "C:\php\php.exe" set "PHPEXE=C:\php\php.exe"
if not defined PHPEXE if exist "C:\xampp\php\php.exe" set "PHPEXE=C:\xampp\php\php.exe"
if not defined PHPEXE for /f "delims=" %%P in ('where php 2^>nul') do if not defined PHPEXE set "PHPEXE=%%P"
if not defined PHPEXE (
    echo PHP nao encontrado. Rode primeiro o instalar-no-windows.bat.
    pause
    exit /b 1
)
for %%F in ("%PHPEXE%") do set "PHPDIR=%%~dpF"
set "CA=%~dp0cacert.pem"

cd /d "%RAIZ%"
if not exist "data" mkdir "data"
"%PHPEXE%" -n ^
  -d extension_dir="%PHPDIR%ext" ^
  -d extension=pdo_sqlite -d extension=sqlite3 -d extension=curl -d extension=mbstring -d extension=openssl -d extension=fileinfo ^
  -d curl.cainfo="%CA%" -d openssl.cafile="%CA%" ^
  -d upload_max_filesize=4M -d post_max_size=8M -d memory_limit=256M ^
  -S 127.0.0.1:8080 servidor.php >> "data\servidor.log" 2>&1
