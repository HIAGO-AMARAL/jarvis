@echo off
chcp 65001 >nul
rem Desliga o servidor do Jarvis (o que está escutando na porta 8080).
for /f "tokens=5" %%p in ('netstat -ano ^| findstr "127.0.0.1:8080" ^| findstr "LISTENING"') do taskkill /PID %%p /F >nul 2>&1
echo Jarvis desligado.
timeout /t 2 >nul
