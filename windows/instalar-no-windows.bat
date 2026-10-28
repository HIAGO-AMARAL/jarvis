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
set "TS=tailscale"
where tailscale >nul 2>&1 || set "TS=%ProgramFiles%\Tailscale\tailscale.exe"
if not exist "%TS%" where tailscale >nul 2>&1 || (
    echo       Instalando o Tailscale pelo winget...
    winget install -e --id Tailscale.Tailscale --accept-package-agreements --accept-source-agreements
    set "TS=%ProgramFiles%\Tailscale\tailscale.exe"
    echo.
    echo       Abra o Tailscale (icone perto do relogio^) e entre com a sua conta Google.
    echo       Depois aperte qualquer tecla aqui para continuar.
    pause >nul
)
echo       Publicando o Jarvis na sua rede privada do Tailscale...
"%TS%" serve --bg http://127.0.0.1:8080
if errorlevel 1 (
    echo.
    echo       O Tailscale pediu para ligar o HTTPS. Abra o link que apareceu acima,
    echo       clique em Enable e rode este instalador de novo.
    pause
    exit /b 1
)

rem ---------------------------------------------------------------- 5. endereco
echo [5/5] Pronto!
for /f "delims=" %%U in ('powershell -NoProfile -Command "try { ((& '%TS%' status --json | ConvertFrom-Json).Self.DNSName).TrimEnd('.') } catch { '' }"') do set "URL=%%U"
echo.
if defined URL (
    echo   Endereco do seu Jarvis:  https://%URL%
    echo   Use ESSE endereco no PC e no celular ^(com o Tailscale ligado no celular^).
    start "" "https://%URL%"
) else (
    echo   Rode "tailscale status" para ver o nome do PC e abra https://NOME-DO-PC.SEU-TAILNET.ts.net
)
echo.
pause
