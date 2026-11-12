@echo off
chcp 65001 >nul
title AN TU DUYEN - 100 DE TU NGAM (TOR MULTI-CIRCUIT)

echo ========================================================================
echo        AN TU DUYEN - CHAY 100 DE TU NGAM (TOR MULTI-CIRCUIT)
echo ========================================================================
echo.

node disciples.js --count=100 --tor --follow --auto --hang=5

pause