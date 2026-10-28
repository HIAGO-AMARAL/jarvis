@echo off
setlocal EnableDelayedExpansion
chcp 65001 >nul
title Finalizar o Jarvis
cd /d "%~dp0.."
echo.
echo  ==============================================
echo   J.A.R.V.I.S  -  finalizar a instalacao
echo  ==============================================
echo.

rem ---------------------------------------------------------------- 1. servidor ligado
echo [1/4] Conferindo se o Jarvis esta ligado...
netstat -ano | findstr "127.0.0.1:8080" | findstr "LISTENING" >nul
if errorlevel 1 (
    echo       Ligando o servidor...
    start "" /min wscript "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Jarvis.vbs"
    timeout /t 3 >nul
) else (
    echo       Ligado.
)

rem ---------------------------------------------------------------- 2. Tailscale logado
echo [2/4] Conferindo o Tailscale...
set "TS=%ProgramFiles%\Tailscale\tailscale.exe"
if not exist "%TS%" (
    echo       Tailscale nao encontrado. Rode o instalar-no-windows.bat de novo.
    pause
    exit /b 1
)
:login
"%TS%" status >nul 2>&1
if errorlevel 1 (
    echo.
    echo       Voce ainda nao entrou no Tailscale.
    echo       Vou abrir a tela de login no navegador: entre com a sua conta Google.
    start "" "%ProgramFiles%\Tailscale\tailscale-ipn.exe"
    "%TS%" up
    goto login
)
echo       Conectado.

rem ---------------------------------------------------------------- 3. HTTPS
echo [3/4] Ligando o endereco com HTTPS...
echo       Se aparecer um link pedindo para ativar, abra ele, clique em Enable e volte aqui.
"%TS%" serve --bg http://127.0.0.1:8080
if errorlevel 1 (
    echo.
    echo       Nao deu certo. Tire um print desta janela e mande para o Claude.
    pause
    exit /b 1
)

set "URL="
for /f "delims=" %%U in ('powershell -NoProfile -Command "((& '%TS%' status --json | ConvertFrom-Json).Self.DNSName).TrimEnd('.')"') do set "URL=https://%%U"
if not defined URL (
    echo       Nao achei o endereco. Tire um print e mande para o Claude.
    pause
    exit /b 1
)

rem ---------------------------------------------------------------- 4. atalho na area de trabalho
echo [4/4] Criando o atalho na area de trabalho...
set "NAV=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "!NAV!" set "NAV=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
> "data\endereco.txt" echo !URL!
powershell -NoProfile -Command "$d=[Environment]::GetFolderPath('Desktop'); $s=(New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $d 'Jarvis.lnk')); $s.TargetPath='!NAV!'; $s.Arguments='--app=!URL!'; $s.IconLocation='%~dp0jarvis.ico'; $s.Description='Jarvis'; $s.Save()"

echo.
echo  ==============================================
echo   Pronto!
echo   Endereco do Jarvis:  !URL!
echo   No celular: instale o Tailscale, entre com a
echo   mesma conta e abra esse endereco no Chrome.
echo  ==============================================
echo.
start "" "!NAV!" --app=!URL!
pause
