# WhisperX Pipeline — Phase 2: Split Services

## Structure

```
whisperx-phase2/
  speech-api/          # FastAPI — WhisperX + pyannote (port 8000)
    main.py
    requirements.txt
  app-api/             # Flask — jobs, DB, frontend (port 5001)
    app.py
    requirements.txt
    templates/
      index.html
  shared/              # Shared uploads + outputs + pipeline.db
    uploads/
    outputs/
  start.sh             # Starts both services together
```

## Setup (one time, same venv as before)

```bash
source .venv311/bin/activate

# speech-api deps
pip install fastapi "uvicorn[standard]" python-multipart

# app-api deps (already installed from Phase 1, just in case)
pip install flask flask-sqlalchemy requests
```

## Running

### Option A — one command (recommended)
```bash
chmod +x start.sh
./start.sh                        # no diarization
./start.sh hf_your_token_here    # with diarization
```

### Option B — two terminals

Terminal 1 (speech-api):
```bash
source .venv311/bin/activate
cd speech-api
HF_TOKEN=hf_your_token uvicorn main:app --port 8000 --reload
```

Terminal 2 (app-api):
```bash
source .venv311/bin/activate
cd app-api
SPEECH_API_BASE_URL=http://localhost:8000 python app.py
```

Then open **http://localhost:5001**

## What changed from Phase 1

- WhisperX/pyannote code moved entirely to `speech-api/main.py`
- `app-api/app.py` now calls `POST /process-audio` on the speech-api via HTTP
- Frontend shows a live speech-api connection status indicator
- Model selector (tiny / base / small / medium / large-v3) added to UI
- Both services share `shared/` folder for uploads, outputs, and the DB
- The speech-api can be tested independently:

```bash
curl http://localhost:8000/health
curl http://localhost:8000/models
```

## API endpoints

### Speech API (port 8000)
- `GET  /health`          — liveness check
- `GET  /models`          — available models
- `POST /process-audio`   — transcribe + diarize audio file

### App API (port 5001)
- `GET  /`                         — frontend UI
- `GET  /health`                   — checks both services
- `GET  /models`                   — proxies speech-api model list
- `POST /upload`                   — upload file and create job
- `GET  /status/<job_id>`          — live progress or completed result
- `GET  /jobs`                     — job history list
- `DELETE /jobs/<job_id>`          — delete job + files
- `PATCH /jobs/<job_id>/speakers/<id>` — rename speaker
- `PATCH /jobs/<job_id>/segments/<id>` — edit segment text
- `GET  /download/<job_id>/<file>` — download transcript file

## Next: Phase 3
Replace `app-api/templates/index.html` with a React + Vite frontend
with 4 pages: Upload, Job Status, Transcript Review, Job History.
