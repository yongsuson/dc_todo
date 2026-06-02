@echo off
chcp 65001 > nul
echo 앱을 시작합니다...
echo 브라우저에서 localhost:8000 으로 접속하세요.
echo 이 창을 닫으면 앱이 종료됩니다.
echo.
python server.py
pause
