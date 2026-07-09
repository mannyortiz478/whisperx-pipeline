# WhisperX Transcription Pipeline

Upload meeting audio → get a multi-speaker transcript with timestamps and action items.

## Architecture

```
Browser (React :5173) → app-api (Flask :5001) → speech-api (FastAPI :8000)
                                ↓
                         SQLite DB + local filesystem
```

---

## Prerequisites

| Tool | Minimum version | Install |
|------|----------------|---------|
| Python | 3.11 | [python.org](https://www.python.org/downloads/) |
| Node.js | 20 | [nodejs.org](https://nodejs.org/) |
| pnpm | 8 | `npm install -g pnpm` |
| Docker Desktop | any | [docker.com](https://www.docker.com/products/docker-desktop/) *(Docker path only)* |

---

## Local Setup (No Docker) — Recommended

This runs all three services as native processes with hot reload.

### Step 1 — Clone and enter the repo

```bash
git clone <repo-url>
cd whisperx-pipeline-phase2
```

### Step 2 — Create a Python 3.11 virtual environment

```bash
python3.11 -m venv .venv311
source .venv311/bin/activate      # macOS / Linux
# .venv311\Scripts\activate       # Windows
```

### Step 3 — Install Python dependencies

```bash
pip install -r speech-api/requirements.txt
pip install -r app-api/requirements.txt
```

> `speech-api` installs WhisperX and pyannote — this can take a few minutes on first run.

### Step 4 — Install frontend dependencies

```bash
pnpm install
```

### Step 5 — Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in:

```dotenv
# Required — get yours at https://huggingface.co/settings/tokens
HF_TOKEN=hf_your_token_here

# Optional — enables GPT-4o action item extraction (falls back to regex if omitted)
OPENAI_API_KEY=sk-...
```

#### HuggingFace token setup (required for speaker diarization)

1. Create a free account at [huggingface.co](https://huggingface.co)
2. Accept the model license agreements:
   - [pyannote/speaker-diarization-3.1](https://huggingface.co/pyannote/speaker-diarization-3.1)
   - [pyannote/segmentation-3.0](https://huggingface.co/pyannote/segmentation-3.0)
3. Create a **Read** token at [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens)
4. Paste it into `.env` as `HF_TOKEN=hf_...`

> Without `HF_TOKEN` the app still works — transcription runs but speaker labels will all be "Speaker".

### Step 6 — Start the three services

Open **three separate terminal tabs** and run one command in each:

**Terminal 1 — Speech API** (WhisperX + diarization, port 8000)

```bash
source .env  # or: export $(cat .env | xargs)
source .venv311/bin/activate
uvicorn main:app --app-dir speech-api --port 8000 --reload
```

**Terminal 2 — App API** (Flask + SQLite, port 5001)

```bash
source .venv311/bin/activate
cd app-api
SPEECH_API_BASE_URL=http://localhost:8000 python app.py
```

**Terminal 3 — Frontend** (React/Vite dev server, port 5173)

```bash
pnpm dev:web
```

### Step 7 — Open the app

```
http://localhost:5173
```

The frontend proxies API calls to Flask automatically — no cross-origin issues.

---

## Local Setup (Single command with concurrently)

If you prefer one terminal, the root `package.json` can start all three services together:

```bash
# Make sure .env is configured and .venv311 is created first (Steps 1–5 above)
pnpm dev:services
```

This uses `concurrently` to stream color-coded logs from all three processes in one terminal.

---

## Docker Setup

Requires Docker Desktop to be running.

### Step 1 — Configure environment

```bash
cp .env.example .env
# Edit .env and add HF_TOKEN (see Step 5 above)
```

### Step 2 — Start

```bash
make dev       # development mode with hot reload
# or
make prod      # production build
```

### Step 3 — Open the app

```
http://localhost:5001
```

In Docker mode, Flask serves the built React app directly (no separate Vite server).

### Docker commands

```bash
make dev          # Start with hot reload
make prod         # Start production build
make build        # Build images without starting
make stop         # Stop all containers
make logs         # Tail all container logs
make clean        # Remove containers and volumes
make shell-api    # Open shell in app-api container
make shell-speech # Open shell in speech-api container
```

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `HF_TOKEN` | For diarization | — | HuggingFace access token |
| `OPENAI_API_KEY` | No | — | GPT-4o action item extraction |
| `DEFAULT_MODEL` | No | `base` | Default Whisper model |
| `APP_API_PORT` | No | `5001` | Port for Flask API |
| `SPEECH_API_PORT` | No | `8000` | Port for FastAPI speech service |
| `MAX_UPLOAD_BYTES` | No | `209715200` | Max upload size (200 MB) |
| `MAX_MEDIA_DURATION_SECONDS` | No | `10800` | Max audio length (3 hours) |

---

## Available Scripts

```bash
pnpm dev:web          # Frontend dev server only
pnpm dev:services     # All three services via concurrently
pnpm build            # Production frontend build
pnpm test:unit        # All unit tests (Python + frontend)
pnpm test:unit:web    # Frontend unit tests
pnpm test:unit:api    # Python unit tests
pnpm test:integration # Python integration tests
pnpm test:e2e         # Playwright end-to-end tests
pnpm typecheck        # TypeScript type check
pnpm lint             # ESLint
```

---

## Project Structure

```
whisperx-pipeline/
├── speech-api/          # FastAPI — WhisperX transcription + diarization
│   ├── main.py
│   └── requirements.txt
├── app-api/             # Flask API + React frontend
│   ├── app.py           # REST API, job queue, SQLite models
│   ├── exporters.py     # TXT / DOCX / PDF generation
│   ├── requirements.txt
│   └── web/             # React + Vite + TypeScript + Tailwind
│       └── src/
│           ├── pages/   # Upload, JobStatus, Transcript, History
│           ├── components/
│           ├── hooks/
│           ├── lib/     # apiFetch, apiUpload, assetUrl
│           └── utils/
├── packages/
│   └── shared-types/    # Shared TypeScript types (@whisperx/shared-types)
├── shared/              # Runtime: uploads/, outputs/, pipeline.db
├── infra/docker/        # Docker Compose files
├── Makefile             # Docker convenience commands
├── package.json         # pnpm workspace root
├── pnpm-workspace.yaml
└── .env.example         # Environment template
```

---

## Tech Stack

- **Frontend:** React 19 + TypeScript + Vite + TanStack Query + Tailwind CSS
- **App API:** Python Flask + SQLAlchemy + SQLite
- **Speech API:** Python FastAPI + WhisperX + pyannote.audio
- **Transcription:** WhisperX (faster-whisper) — tiny / base / small / medium / large-v3
- **Diarization:** pyannote speaker diarization 3.1
- **Action Items:** GPT-4o (optional) with regex fallback
- **Exports:** TXT, DOCX, PDF
- **Monorepo:** pnpm workspaces with shared TypeScript types
