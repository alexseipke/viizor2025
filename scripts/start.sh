#!/bin/bash
echo "🚀 Iniciando aplicación Potree..."

# Iniciar backend
cd backend
npm start &
BACKEND_PID=$!

echo "Backend iniciado (PID: $BACKEND_PID)"
echo "Frontend disponible en http://t.viizor.app/landtest"
echo "API disponible en http://t.viizor.app/api"

# Guardar PID para poder detener después
echo $BACKEND_PID > ../logs/backend.pid

wait
