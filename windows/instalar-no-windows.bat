@echo off
setlocal
chcp 65001 >nul
title Instalar o Jarvis no PC
cd /d "%~dp0.."
echo.
echo  ==============================================
echo   J.A.R.V.I.S  -  instalacao no PC
echo  ==============================================
echo.

rem ---------------------------------------------------------------- 1. PHP
echo [1/5] Conferindo o PHP...
set "TEMPHP="
for /d %%D in ("%LOCALAPPDATA%\Microsoft\WinGet\Packages\PHP.PHP.8.*") do if exist "%%D\php.exe" set "TEMPHP=1"
if exist "C:\php\php.exe" set "TEMPHP=1"
if exist "C:\xampp\php\php.exe" set "TEMPHP=1"
where php >nul 2>&1 && set "TEMPHP=1"
if not defined TEMPHP (
    echo       Instalando o PHP 8.3 pelo winget...
    winget install -e --id PHP.PHP.8.3 --accept-package-agreements --accept-source-agreements
) else (
    echo       PHP encontrado.
)

rem ---------------------------------------------------------------- 2. configuracao
echo [2/5] Preparando a configuracao...
if not exist "lib\config.php" copy "lib\config.example.php" "lib\config.php" >nul
if not exist "data" mkdir "data"

rem ---------------------------------------------------------------- 3. ligar junto com o Windows
echo [3/5] Fazendo o Jarvis ligar sozinho quando o PC ligar...
set "INICIO=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Jarvis.vbs"
> "%INICIO%" echo CreateObject("WScript.Shell").Run """%~dp0iniciar-jarvis.bat""", 0, False
call "%~dp0parar-jarvis.bat" >nul 2>&1
wscript "%INICIO%"
timeout /t 3 >nul

rem ---------------------------------------------------------------- 4. Tailscale (HTTPS e acesso pelo celular)
echo [4/5] Conferindo o Tailscale...
if not exist "%ProgramFiles%\Tailscale\tailscale.exe" winget install -e --id Tailscale.Tailscale --accept-package-agreements --accept-source-agreements

rem ---------------------------------------------------------------- 5. login, HTTPS e atalho
echo [5/5] Terminando...
call "%~dp0finalizar-jarvis.bat"
