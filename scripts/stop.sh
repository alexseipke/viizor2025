#!/bin/bash
echo "⏹️  Deteniendo aplicación Potree..."

if [ -f "../logs/backend.pid" ]; then
    kill $(cat ../logs/backend.pid)
    rm ../logs/backend.pid
    echo "Backend detenido"
else
    echo "No se encontró PID del backend"
fi
