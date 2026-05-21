"""
Application API — Flask service (port 5001)
Owns: file validation, job tracking, DB persistence, speaker rename,
      segment editing, exports, and calling the Speech Processing API.

Run: python app.py
Then open http://localhost:5001 in your browser
"""

import os
import uuid
import shutil
import threading
import requests
from datetime import datetime, timezone
from pathlib import Path

from flask import Flask, render_template, request, jsonify, send_from_directory
from flask_sqlalchemy import SQLAlchemy
from werkzeug.utils import secure_filename

# ─── Config ──────────────────────────────────────────────────────────────────

app = Flask(__name__)

BASE_DIR    = Path(__file__).parent.parent / "shared"
UPLOAD_DIR  = BASE_DIR / "uploads"
OUTPUT_DIR  = BASE_DIR / "outputs"

app.config["UPLOAD_FOLDER"]             = str(UPLOAD_DIR)
app.config["OUTPUT_FOLDER"]             = str(OUTPUT_DIR)
app.config["MAX_CONTENT_LENGTH"]        = int(os.environ.get("MAX_UPLOAD_BYTES", 500 * 1024 * 1024))
app.config["SQLALCHEMY_DATABASE_URI"]   = os.environ.get("DATABASE_URL", f"sqlite:///{BASE_DIR}/pipeline.db")
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

SPEECH_API_URL = os.environ.get("SPEECH_API_BASE_URL", "http://localhost:8000")
ALLOWED_EXTENSIONS = {"mp3", "mp4", "wav", "m4a", "ogg", "flac", "webm", "mkv"}

db = SQLAlchemy(app)

# Live progress (only populated while a job is running)
progress_store: dict = {}


# ─── Models ──────────────────────────────────────────────────────────────────

class Job(db.Model):
    __tablename__ = "jobs"
    id                  = db.Column(db.String, primary_key=True)
    filename            = db.Column(db.String, nullable=False)
    filepath            = db.Column(db.String, nullable=False)
    status              = db.Column(db.String, default="queued")
    transcription_model = db.Column(db.String, default="base")
    language            = db.Column(db.String)
    duration            = db.Column(db.Float)
    error               = db.Column(db.Text)
    created_at          = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    started_at          = db.Column(db.DateTime)
    completed_at        = db.Column(db.DateTime)
    failed_at           = db.Column(db.DateTime)

    speakers = db.relationship("Speaker",    back_populates="job", cascade="all, delete-orphan")
    segments = db.relationship("Segment",    back_populates="job", cascade="all, delete-orphan", order_by="Segment.start")
    actions  = db.relationship("ActionItem", back_populates="job", cascade="all, delete-orphan")

    def to_summary(self):
        return {
            "job_id":             self.id,
            "filename":           self.filename,
            "status":             self.status,
            "transcription_model": self.transcription_model,
            "duration":           self.duration,
            "language":           self.language,
            "created_at":         self.created_at.isoformat() if self.created_at else None,
        }


class Speaker(db.Model):
    __tablename__ = "speakers"
    id             = db.Column(db.String, primary_key=True, default=lambda: str(uuid.uuid4()))
    job_id         = db.Column(db.String, db.ForeignKey("jobs.id"), nullable=False)
    original_label = db.Column(db.String, nullable=False)
    display_name   = db.Column(db.String, nullable=False)
    updated_at     = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    job            = db.relationship("Job", back_populates="speakers")
    segments       = db.relationship("Segment", back_populates="speaker")

    def to_dict(self):
        return {
            "speaker_id":     self.id,
            "original_label": self.original_label,
            "display_name":   self.display_name,
        }


class Segment(db.Model):
    __tablename__ = "segments"
    id            = db.Column(db.String, primary_key=True, default=lambda: str(uuid.uuid4()))
    job_id        = db.Column(db.String, db.ForeignKey("jobs.id"), nullable=False)
    speaker_id    = db.Column(db.String, db.ForeignKey("speakers.id"))
    start         = db.Column(db.Float, nullable=False)
    end           = db.Column(db.Float, nullable=False)
    text          = db.Column(db.Text, nullable=False)
    original_text = db.Column(db.Text, nullable=False)
    confidence    = db.Column(db.Float)
    updated_at    = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    job           = db.relationship("Job", back_populates="segments")
    speaker       = db.relationship("Speaker", back_populates="segments")

    def to_dict(self):
        return {
            "segment_id": self.id,
            "speaker":    self.speaker.display_name if self.speaker else "Speaker",
            "speaker_id": self.speaker_id,
            "start":      self.start,
            "end":        self.end,
            "text":       self.text,
            "timestamp":  format_timestamp(self.start),
        }


class ActionItem(db.Model):
    __tablename__ = "action_items"
    id        = db.Column(db.String, primary_key=True, default=lambda: str(uuid.uuid4()))
    job_id    = db.Column(db.String, db.ForeignKey("jobs.id"), nullable=False)
    text      = db.Column(db.Text, nullable=False)
    assignee  = db.Column(db.String)
    priority  = db.Column(db.String, default="normal")
    timestamp = db.Column(db.String)
    due_date  = db.Column(db.String, nullable=True)
    job       = db.relationship("Job", back_populates="actions")

    def to_dict(self):
        return {
            "id":        self.id,
            "text":      self.text,
            "assignee":  self.assignee,
            "priority":  self.priority,
            "timestamp": self.timestamp,
            "due_date":  self.due_date,
        }


# ─── Helpers ─────────────────────────────────────────────────────────────────

def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def format_timestamp(seconds):
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    return f"{h:02d}:{m:02d}:{s:02d}" if h else f"{m:02d}:{s:02d}"


def set_progress(job_id, status, progress, message):
    progress_store[job_id] = {"status": status, "progress": progress, "message": message}


# ─── Worker ──────────────────────────────────────────────────────────────────

def run_job(job_id: str, filepath: str, hf_token: str | None, transcription_model: str):
    """Calls the speech-api and persists results to the DB."""
    with app.app_context():
        try:
            job = db.session.get(Job, job_id)
            job.status     = "processing"
            job.started_at = datetime.now(timezone.utc)
            db.session.commit()

            set_progress(job_id, "processing", 10, "Sending to speech processing API...")

            # Check speech-api is reachable
            try:
                requests.get(f"{SPEECH_API_URL}/health", timeout=5)
            except requests.exceptions.ConnectionError:
                raise RuntimeError(
                    f"Cannot reach Speech API at {SPEECH_API_URL}. "
                    "Is it running? Start it with: uvicorn main:app --port 8000"
                )

            set_progress(job_id, "processing", 20, "Transcribing audio (this may take a while)...")

            # Send file to speech-api
            with open(filepath, "rb") as f:
                resp = requests.post(
                    f"{SPEECH_API_URL}/process-audio",
                    files={"file": (Path(filepath).name, f)},
                    data={
                        "transcription_model":    transcription_model,
                        "enable_diarization":     "true",
                        "enable_word_timestamps": "true",
                        **({"hf_token": hf_token} if hf_token else {}),
                    },
                    timeout=7200,  # 2 hours max
                )

            if resp.status_code != 200:
                detail = resp.json().get("detail", {})
                msg = detail.get("message", str(detail)) if isinstance(detail, dict) else str(detail)
                raise RuntimeError(msg)

            data = resp.json()
            set_progress(job_id, "processing", 85, "Saving results to database...")

            # Map speech-api speaker_ids to DB Speaker rows
            speaker_map: dict[str, Speaker] = {}
            for i, sp in enumerate(data.get("speakers", [])):
                db_speaker = Speaker(
                    job_id=job_id,
                    original_label=sp["speaker_id"],
                    display_name=sp["label"],
                )
                db.session.add(db_speaker)
                db.session.flush()
                speaker_map[sp["speaker_id"]] = db_speaker

            # Create Segment rows
            for seg in data.get("segments", []):
                sp = speaker_map.get(seg["speaker_id"])
                db.session.add(Segment(
                    job_id=job_id,
                    speaker_id=sp.id if sp else None,
                    start=seg["start_seconds"],
                    end=seg["end_seconds"],
                    text=seg["text"],
                    original_text=seg["text"],
                    confidence=seg.get("confidence"),
                ))

            # Create ActionItem rows
            # GPT-4o returns "assignee" directly; regex returns "speaker_label" (SPEAKER_XX id)
            for item in data.get("action_items", []):
                raw_lbl = item.get("speaker_label", "")
                sp = speaker_map.get(raw_lbl)
                assignee = (
                    item.get("assignee")
                    or (sp.display_name if sp else None)
                    or raw_lbl
                    or "Team"
                )
                db.session.add(ActionItem(
                    job_id=job_id,
                    text=item["text"],
                    assignee=assignee,
                    priority=item.get("priority", "normal"),
                    timestamp=item.get("timestamp"),
                    due_date=item.get("due_date"),
                ))

            # Save transcript txt
            output_dir = OUTPUT_DIR / job_id
            output_dir.mkdir(parents=True, exist_ok=True)
            with open(output_dir / "transcript.txt", "w") as f:
                for seg in data.get("segments", []):
                    sp   = speaker_map.get(seg["speaker_id"])
                    name = sp.display_name if sp else "Speaker"
                    ts   = format_timestamp(seg["start_seconds"])
                    f.write(f"[{ts}] {name}: {seg['text']}\n")

            job = db.session.get(Job, job_id)
            job.status       = "completed"
            job.language     = data.get("language", "unknown")
            job.duration     = data.get("duration_seconds", 0)
            job.completed_at = datetime.now(timezone.utc)
            db.session.commit()

            set_progress(job_id, "done", 100, "Complete!")

        except Exception as e:
            with app.app_context():
                j = db.session.get(Job, job_id)
                if j:
                    j.status    = "failed"
                    j.error     = str(e)
                    j.failed_at = datetime.now(timezone.utc)
                    db.session.commit()
            set_progress(job_id, "error", 0, str(e))


# ─── Routes ──────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    web_dist = Path(__file__).parent / "web" / "dist" / "index.html"
    if web_dist.exists():
        return send_from_directory(
            str(Path(__file__).parent / "web" / "dist"),
            "index.html",
        )
    return render_template("index.html")


@app.route("/<path:path>")
def serve_react(path: str):
    """Serve React app for all non-API routes"""
    web_dist = Path(__file__).parent / "web" / "dist"
    
    # If the path is a file in dist, serve it
    if (web_dist / path).exists() and (web_dist / path).is_file():
        return send_from_directory(str(web_dist), path)
    
    # Otherwise, serve index.html (for React Router)
    if (web_dist / "index.html").exists():
        return send_from_directory(str(web_dist), "index.html")
    
    return render_template("index.html")


@app.route("/health")
def health():
    # Also probe speech-api
    speech_ok = False
    try:
        r = requests.get(f"{SPEECH_API_URL}/health", timeout=3)
        speech_ok = r.status_code == 200
    except Exception:
        pass
    return jsonify({"status": "ok", "speech_api": "ok" if speech_ok else "unreachable"})


@app.route("/models")
def get_models():
    """Proxy the model list from speech-api so the frontend stays decoupled."""
    try:
        r = requests.get(f"{SPEECH_API_URL}/models", timeout=5)
        return jsonify(r.json())
    except Exception:
        return jsonify({
            "transcription_models": [
                {"id": "tiny",     "available": True},
                {"id": "base",     "available": True},
                {"id": "small",    "available": True},
                {"id": "medium",   "available": True},
                {"id": "large-v3", "available": True},
            ]
        })


@app.route("/upload", methods=["POST"])
def upload():
    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400
    file     = request.files["file"]
    hf_token = request.form.get("hf_token", "").strip() or None
    model    = request.form.get("transcription_model", "base").strip()

    if not file.filename:
        return jsonify({"error": "No file selected"}), 400
    if not allowed_file(file.filename):
        return jsonify({"error": f"Unsupported format. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"}), 400

    filename = secure_filename(file.filename)
    job_id   = f"job_{uuid.uuid4().hex[:12]}"
    filepath = str(UPLOAD_DIR / f"{job_id}_{filename}")
    file.save(filepath)

    db.session.add(Job(
        id=job_id, filename=filename, filepath=filepath,
        status="queued", transcription_model=model,
    ))
    db.session.commit()
    set_progress(job_id, "queued", 0, "Job queued...")

    threading.Thread(
        target=run_job,
        args=(job_id, filepath, hf_token, model),
        daemon=True,
    ).start()

    return jsonify({"job_id": job_id})


@app.route("/status/<job_id>")
def status(job_id):
    live = progress_store.get(job_id)
    job  = db.session.get(Job, job_id)
    if not job:
        return jsonify({"error": "Job not found"}), 404

    if live and job.status in ("queued", "processing"):
        return jsonify({**live, "filename": job.filename})

    if job.status == "completed":
        segments  = [s.to_dict() for s in job.segments]
        full_text = " ".join(s["text"] for s in segments)
        return jsonify({
            "status": "done", "progress": 100, "message": "Complete!",
            "filename": job.filename,
            "result": {
                "job_id":         job.id,
                "language":       job.language,
                "duration":       job.duration,
                "speaker_count":  len(job.speakers),
                "segment_count":  len(segments),
                "speakers":       [sp.to_dict() for sp in job.speakers],
                "transcript":     segments,
                "action_items":   [a.to_dict() for a in job.actions],
                "full_text":      full_text,
            },
        })

    if job.status == "failed":
        return jsonify({"status": "error", "progress": 0,
                        "message": job.error or "Processing failed.", "filename": job.filename})

    return jsonify({"status": job.status, "progress": 0, "message": "Queued...", "filename": job.filename})


@app.route("/jobs")
def list_jobs():
    jobs = Job.query.order_by(Job.created_at.desc()).all()
    return jsonify({"jobs": [j.to_summary() for j in jobs]})


@app.route("/jobs/<job_id>", methods=["DELETE"])
def delete_job(job_id):
    job = db.session.get(Job, job_id)
    if not job:
        return jsonify({"error": "Job not found"}), 404
    try:
        if os.path.exists(job.filepath):
            os.remove(job.filepath)
    except OSError:
        pass
    out = OUTPUT_DIR / job_id
    if out.exists():
        shutil.rmtree(out)
    db.session.delete(job)
    db.session.commit()
    progress_store.pop(job_id, None)
    return jsonify({"deleted": True})


@app.route("/jobs/<job_id>/retry", methods=["POST"])
def retry_job(job_id):
    job = db.session.get(Job, job_id)
    if not job:
        return jsonify({"error": "Job not found"}), 404
    if job.status != "failed":
        return jsonify({"error": "Job is not in a failed state"}), 400

    job.status       = "queued"
    job.error        = None
    job.started_at   = None
    job.completed_at = None
    job.failed_at    = None
    db.session.commit()

    hf_token = os.environ.get("HF_TOKEN")
    threading.Thread(
        target=run_job,
        args=(job_id, job.filepath, hf_token, job.transcription_model),
        daemon=True,
    ).start()

    return jsonify({"job_id": job.id, "status": "queued", "retried": True})


@app.route("/jobs/<job_id>/speakers/<speaker_id>", methods=["PATCH"])
def rename_speaker(job_id, speaker_id):
    data         = request.get_json()
    display_name = (data or {}).get("display_name", "").strip()
    if not display_name:
        return jsonify({"error": "display_name is required"}), 400
    speaker = db.session.get(Speaker, speaker_id)
    if not speaker or speaker.job_id != job_id:
        return jsonify({"error": "Speaker not found"}), 404
    speaker.display_name = display_name
    speaker.updated_at   = datetime.now(timezone.utc)
    db.session.commit()
    return jsonify(speaker.to_dict())


@app.route("/jobs/<job_id>/segments/<segment_id>", methods=["PATCH"])
def edit_segment(job_id, segment_id):
    data    = request.get_json()
    text    = (data or {}).get("text", "").strip()
    if not text:
        return jsonify({"error": "text is required"}), 400
    segment = db.session.get(Segment, segment_id)
    if not segment or segment.job_id != job_id:
        return jsonify({"error": "Segment not found"}), 404
    segment.text       = text
    segment.updated_at = datetime.now(timezone.utc)
    db.session.commit()
    return jsonify(segment.to_dict())


@app.route("/audio/<job_id>")
def stream_audio(job_id):
    job = db.session.get(Job, job_id)
    if not job:
        return jsonify({"error": "Not found"}), 404
    return send_from_directory(
        str(UPLOAD_DIR),
        Path(job.filepath).name,
        mimetype="audio/mpeg"
    )


@app.route("/download/<job_id>/<filename>")
def download(job_id, filename):
    include_ts = request.args.get("include_timestamps", "true").lower() != "false"
    if filename == "transcript.txt" and not include_ts:
        job = db.session.get(Job, job_id)
        if not job or job.status != "completed":
            return jsonify({"error": "Job not found or not completed"}), 404
        from exporters import generate_txt
        text = generate_txt(job.segments, include_timestamps=False)
        from flask import Response
        return Response(
            text,
            mimetype="text/plain",
            headers={"Content-Disposition": f'attachment; filename="{Path(job.filename).stem}_transcript.txt"'},
        )
    folder = str(OUTPUT_DIR / job_id)
    return send_from_directory(folder, filename, as_attachment=True)


@app.route("/jobs/<job_id>/export/docx")
def export_docx(job_id):
    job = db.session.get(Job, job_id)
    if not job or job.status != "completed":
        return jsonify({"error": "Job not found or not completed"}), 404
    include_ts = request.args.get("include_timestamps", "true").lower() != "false"
    from exporters import generate_docx
    output_path = OUTPUT_DIR / job_id / "transcript.docx"
    generate_docx(
        job=job,
        segments=job.segments,
        speakers=job.speakers,
        action_items=job.actions,
        output_path=str(output_path),
        include_timestamps=include_ts,
    )
    return send_from_directory(
        str(OUTPUT_DIR / job_id),
        "transcript.docx",
        as_attachment=True,
        download_name=f"{Path(job.filename).stem}_transcript.docx",
    )


@app.route("/jobs/<job_id>/export/pdf")
def export_pdf(job_id):
    job = db.session.get(Job, job_id)
    if not job or job.status != "completed":
        return jsonify({"error": "Job not found or not completed"}), 404
    include_ts = request.args.get("include_timestamps", "true").lower() != "false"
    from exporters import generate_pdf
    output_path = OUTPUT_DIR / job_id / "transcript.pdf"
    generate_pdf(
        job=job,
        segments=job.segments,
        speakers=job.speakers,
        action_items=job.actions,
        output_path=str(output_path),
        include_timestamps=include_ts,
    )
    return send_from_directory(
        str(OUTPUT_DIR / job_id),
        "transcript.pdf",
        as_attachment=True,
        download_name=f"{Path(job.filename).stem}_transcript.pdf",
    )


# ─── Init ─────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    with app.app_context():
        db.create_all()
        # Migrate existing DBs: add due_date column if it doesn't exist yet
        from sqlalchemy import text as sa_text
        with db.engine.connect() as _conn:
            try:
                _conn.execute(sa_text("ALTER TABLE action_items ADD COLUMN due_date TEXT"))
                _conn.commit()
            except Exception:
                pass  # column already present
        print("✓ Database ready")
    print(f"\n App API        → http://localhost:5001")
    print(f"   Speech API     → {SPEECH_API_URL}")
    print(f"   Open browser   → http://localhost:5001\n")
    app.run(debug=True, port=5001)
