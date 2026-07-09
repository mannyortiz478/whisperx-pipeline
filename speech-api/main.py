"""
Speech Processing API — FastAPI service (port 8000)
Owns: WhisperX transcription, alignment, pyannote diarization.
Knows nothing about users, jobs, or the database.

Run: uvicorn main:app --port 8000 --reload
"""

import json
import os
import re
import tempfile
import time
import traceback
import uuid as _uuid
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, Request, UploadFile, File, Form, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware

from logger import logger

app = FastAPI(title="Speech Processing API", version="1.0.0")


class RequestIDMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get('X-Request-ID') or _uuid.uuid4().hex[:16]
        request.state.request_id = request_id
        response = await call_next(request)
        response.headers['X-Request-ID'] = request_id
        return response


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start = time.time()
        response = await call_next(request)
        duration_ms = round((time.time() - start) * 1000)
        logger.info('http_request', extra={
            'request_id':  getattr(request.state, 'request_id', None),
            'method':      request.method,
            'path':        request.url.path,
            'status':      response.status_code,
            'duration_ms': duration_ms,
        })
        return response


app.add_middleware(RequestIDMiddleware)
app.add_middleware(RequestLoggingMiddleware)

# ─── Config ──────────────────────────────────────────────────────────────────

SUPPORTED_MODELS = os.environ.get(
    "TRANSCRIPTION_MODEL_NAMES", "tiny,base,small,medium,large-v3"
).split(",")
DEFAULT_MODEL = os.environ.get("DEFAULT_MODEL", "base")
HF_TOKEN = os.environ.get("HF_TOKEN", "")


# ─── Helpers ─────────────────────────────────────────────────────────────────

def format_timestamp(seconds: float) -> str:
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    return f"{h:02d}:{m:02d}:{s:02d}" if h else f"{m:02d}:{s:02d}"


_SYSTEM_PROMPT = (
    "You are an expert meeting analyst. Extract all action items from this "
    "meeting transcript. For each action item return a JSON object with:\n"
    "- text: clear description of the task (start with a verb)\n"
    "- assignee: speaker label of who is responsible (or 'Team' if unclear)\n"
    "- priority: 'high' if urgent/critical/ASAP, 'medium' if has a deadline, "
    "'normal' otherwise\n"
    "- timestamp: time when it was mentioned (MM:SS format)\n"
    "- due_date: inferred due date as plain text if mentioned, else null\n"
    "Return ONLY a valid JSON array of action item objects. No markdown, no "
    "preamble, no explanation."
)


def _regex_extract(segments: list, speaker_labels: dict) -> list:
    patterns = [
        r"(?:i'?ll|i will|i can|let me|i'm going to|i need to|i should)\s+([^.!?\n]{10,80})",
        r"(?:can you|could you|please|would you)\s+([^.!?\n]{10,80})",
        r"(?:action item|todo|follow up|follow-up|next step)s?[:\s]+([^.!?\n]{10,80})",
        r"(?:we need to|we should|we will|we'll|we have to)\s+([^.!?\n]{10,80})",
        r"(?:by (?:next week|tomorrow|friday|monday|end of week|eod))[,\s]+([^.!?\n]{5,80})",
    ]
    items, seen = [], set()
    for seg in segments:
        text_lower = seg.get("text", "").lower()
        raw_lbl = seg.get("speaker", "SPEAKER_00")
        for pattern in patterns:
            for match in re.findall(pattern, text_lower, re.IGNORECASE):
                cleaned = match.strip().rstrip(".,;:")
                key = cleaned[:40]
                if key not in seen and len(cleaned) > 8:
                    seen.add(key)
                    priority = (
                        "high" if any(w in text_lower for w in ["urgent", "asap", "critical"])
                        else "medium" if any(w in text_lower for w in ["soon", "next week", "by friday"])
                        else "normal"
                    )
                    items.append({
                        "text":          cleaned.capitalize(),
                        "speaker_label": raw_lbl,
                        "priority":      priority,
                        "timestamp":     format_timestamp(seg.get("start", 0)),
                        "due_date":      None,
                    })
    return items[:25]


def extract_action_items(segments: list, speaker_labels: dict) -> list:
    anthropic_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()

    if anthropic_key:
        logger.info('action_extraction_method', extra={'method': 'claude'})
        try:
            from anthropic import Anthropic  # lazy import — optional dependency

            lines = []
            for seg in segments:
                raw_lbl = seg.get("speaker", "SPEAKER_00")
                name = speaker_labels.get(raw_lbl, raw_lbl)
                ts = format_timestamp(seg.get("start", 0))
                text = seg.get("text", "").strip()
                if text:
                    lines.append(f"{name} [{ts}]: {text}")
            transcript_str = "\n".join(lines)

            client = Anthropic(api_key=anthropic_key)
            response = client.messages.create(
                model="claude-opus-4-7",
                max_tokens=1000,
                system=[{
                    "type": "text",
                    "text": _SYSTEM_PROMPT,
                    "cache_control": {"type": "ephemeral"},
                }],
                messages=[{"role": "user", "content": transcript_str}],
            )
            raw = next((b.text for b in response.content if b.type == "text"), "")
            items = json.loads(raw)
            if isinstance(items, list):
                return items[:25]
        except Exception as exc:
            logger.error('claude_extraction_failed', extra={'error': str(exc)}, exc_info=True)

    logger.info('action_extraction_method', extra={'method': 'regex'})
    return _regex_extract(segments, speaker_labels)


# ─── Routes ──────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "models_available": SUPPORTED_MODELS}


@app.get("/models")
def models():
    return {
        "transcription_models": [{"id": m, "available": True} for m in SUPPORTED_MODELS],
        "diarization_model":    "pyannote/speaker-diarization-3.1",
        "supports_word_timestamps": True,
        "supports_diarization":     bool(HF_TOKEN),
    }


@app.post("/process-audio")
async def process_audio(
    request:               Request,
    file:                  UploadFile       = File(...),
    transcription_model:   str              = Form(DEFAULT_MODEL),
    enable_diarization:    bool             = Form(True),
    enable_word_timestamps: bool            = Form(True),
    hf_token:              Optional[str]    = Form(None),
):
    """
    Accepts an audio file, runs WhisperX + optional pyannote diarization,
    returns structured transcript with speaker labels and action items.
    """
    if transcription_model not in SUPPORTED_MODELS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported model '{transcription_model}'. Available: {SUPPORTED_MODELS}",
        )

    token = (hf_token or "").strip() or HF_TOKEN or None
    suffix = Path(file.filename).suffix if file.filename else ".audio"

    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name

    request_id = getattr(request.state, 'request_id', None)

    try:
        import whisperx
        import torch
        from whisperx.diarize import DiarizationPipeline

        device       = "cuda" if torch.cuda.is_available() else "cpu"
        compute_type = "float16" if device == "cuda" else "int8"

        logger.info('processing_started', extra={
            'request_id':           request_id,
            'filename':             file.filename,
            'transcription_model':  transcription_model,
            'device':               device,
            'enable_diarization':   enable_diarization,
        })

        # 1. Transcribe
        model  = whisperx.load_model(transcription_model, device, compute_type=compute_type)
        audio  = whisperx.load_audio(tmp_path)
        result = model.transcribe(audio, batch_size=16)

        # 2. Align
        model_a, metadata = whisperx.load_align_model(
            language_code=result["language"], device=device
        )
        result = whisperx.align(
            result["segments"], model_a, metadata, audio, device,
            return_char_alignments=False,
        )

        logger.info('transcription_complete', extra={
            'request_id':    request_id,
            'segment_count': len(result.get('segments', [])),
            'language':      result.get('language'),
        })

        # 3. Diarize
        if enable_diarization and token:
            diarize_model    = DiarizationPipeline(
                model_name="pyannote/speaker-diarization-3.1",
                token=token, device=device,
            )
            diarize_segments = diarize_model(audio)
            result           = whisperx.assign_word_speakers(diarize_segments, result)

        # 4. Build response
        raw_segments = result.get("segments", [])

        seen_labels: list = []
        for seg in raw_segments:
            lbl = seg.get("speaker", "SPEAKER_00")
            if lbl not in seen_labels:
                seen_labels.append(lbl)

        logger.info('diarization_complete', extra={
            'request_id':    request_id,
            'speaker_count': len(seen_labels),
        })

        speakers       = [{"speaker_id": lbl, "label": f"Speaker {i + 1}"} for i, lbl in enumerate(seen_labels)]
        speaker_labels = {sp["speaker_id"]: sp["label"] for sp in speakers}

        segments_out = []
        for seg in raw_segments:
            raw_lbl = seg.get("speaker", "SPEAKER_00")
            words = []
            if enable_word_timestamps:
                for w in seg.get("words", []):
                    words.append({
                        "text":          w.get("word", ""),
                        "start_seconds": round(w.get("start", 0), 3),
                        "end_seconds":   round(w.get("end", 0), 3),
                        "confidence":    w.get("score"),
                    })
            segments_out.append({
                "speaker_id":    raw_lbl,
                "start_seconds": round(seg.get("start", 0), 3),
                "end_seconds":   round(seg.get("end", 0), 3),
                "text":          seg.get("text", "").strip(),
                "confidence":    seg.get("avg_logprob"),
                "words":         words,
            })

        duration     = raw_segments[-1]["end"] if raw_segments else 0
        action_items = extract_action_items(raw_segments, speaker_labels)

        logger.info('action_items_extracted', extra={
            'request_id': request_id,
            'count':      len(action_items),
        })

        return {
            "language":            result.get("language", "unknown"),
            "transcription_model": transcription_model,
            "duration_seconds":    round(duration, 2),
            "speakers":            speakers,
            "segments":            segments_out,
            "action_items":        action_items,
        }

    except Exception as e:
        logger.error('processing_failed', extra={
            'request_id': request_id,
            'filename':   file.filename,
            'model':      transcription_model,
            'error':      str(e),
        }, exc_info=True)
        raise HTTPException(status_code=500, detail={
            "code":      "PROCESSING_FAILED",
            "message":   str(e),
            "traceback": traceback.format_exc(),
        })
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


if __name__ == "__main__":
    import uvicorn
    logger.info('speech_api_starting', extra={
        'port':              8000,
        'default_model':     DEFAULT_MODEL,
        'models_available':  SUPPORTED_MODELS,
        'hf_token_set':      bool(HF_TOKEN),
    })
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
