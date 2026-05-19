#!/bin/bash
# start.sh — runs both services in parallel
# Usage: ./start.sh [hf_token]
# Example: ./start.sh hf_abc123

set -e

HF_TOKEN="${1:-}"

echo ""
echo "  WhisperX Pipeline — Phase 2"
echo "  ─────────────────────────────"
echo "  Speech API  → http://localhost:8000"
echo "  App API     → http://localhost:5001"
echo ""

# Activate venv if present
if [ -f ".venv311/bin/activate" ]; then
  source .venv311/bin/activate
elif [ -f "venv/bin/activate" ]; then
  source venv/bin/activate
fi

# Start speech-api in background
cd speech-api
HF_TOKEN="$HF_TOKEN" OPENAI_API_KEY="${OPENAI_API_KEY:-}" uvicorn main:app --port 8000 --reload &
SPEECH_PID=$!
cd ..

# Give speech-api a moment to bind
sleep 1

# Start app-api in foreground
cd app-api
SPEECH_API_BASE_URL=http://localhost:8000 python app.py &
APP_PID=$!
cd ..

echo ""
echo "  Both services running."
echo "  Open http://localhost:5001 in your browser."
echo "  Press Ctrl+C to stop both."
echo ""

# Wait and clean up both on exit
trap "kill $SPEECH_PID $APP_PID 2>/dev/null; echo 'Stopped.'" EXIT
wait
