@echo off
chcp 65001 >nul
title AN TU DUYEN - BANG DIEU KHIEN DE TU (GUI)

echo ========================================================================
echo        AN TU DUYEN - BANG DIEU KHIEN QUAN DOAN DE TU (GUI)
echo ========================================================================
echo.

node disciples.js --gui --count=100 --free-proxy --follow --auto --hang=5

pause