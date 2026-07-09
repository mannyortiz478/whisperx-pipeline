import os
import sys
import tempfile
import uuid
from pathlib import Path

# Must be set before importing app so the module-level paths use our temp dir
_TEST_BASE = tempfile.mkdtemp(prefix='whisperx_test_')
os.environ['SHARED_DIR'] = _TEST_BASE

# Create the expected sub-dirs up front
Path(_TEST_BASE, 'uploads').mkdir(exist_ok=True)
Path(_TEST_BASE, 'outputs').mkdir(exist_ok=True)

import pytest
# Add app-api to the import path
sys.path.insert(0, str(Path(__file__).parent.parent))

from app import app as flask_app, db
import app as app_module


@pytest.fixture(scope='session', autouse=True)
def _patch_dirs():
    """Keep module-level UPLOAD_DIR / OUTPUT_DIR pointing at the temp base."""
    app_module.UPLOAD_DIR = Path(_TEST_BASE, 'uploads')
    app_module.OUTPUT_DIR = Path(_TEST_BASE, 'outputs')


@pytest.fixture(scope='session')
def _create_tables():
    flask_app.config.update({
        'TESTING': True,
        'SQLALCHEMY_DATABASE_URI': f'sqlite:///{_TEST_BASE}/test.db',
    })
    with flask_app.app_context():
        db.create_all()
    yield
    with flask_app.app_context():
        db.drop_all()


@pytest.fixture(scope='function')
def app(_create_tables):
    flask_app.config['TESTING'] = True
    yield flask_app
    # Clean all rows after each test
    with flask_app.app_context():
        from sqlalchemy import text
        db.session.execute(text('DELETE FROM action_items'))
        db.session.execute(text('DELETE FROM transcript_words'))
        db.session.execute(text('DELETE FROM segments'))
        db.session.execute(text('DELETE FROM speakers'))
        db.session.execute(text('DELETE FROM jobs'))
        db.session.commit()


@pytest.fixture
def client(app):
    return app.test_client()


@pytest.fixture
def app_ctx(app):
    with app.app_context():
        yield


@pytest.fixture
def sample_job(app):
    from app import Job, db as _db
    job_id = f'job_{uuid.uuid4().hex[:12]}'
    with app.app_context():
        job = Job(
            id=job_id,
            filename='meeting.mp3',
            filepath=str(app_module.UPLOAD_DIR / f'{job_id}_meeting.mp3'),
            status='completed',
            transcription_model='base',
            language='en',
            duration=125.4,
        )
        _db.session.add(job)
        _db.session.commit()
    yield job_id


@pytest.fixture
def sample_job_with_data(app, sample_job):
    from app import Job, Speaker, Segment, ActionItem, db as _db
    with app.app_context():
        job = _db.session.get(Job, sample_job)
        sp1 = Speaker(
            id=str(uuid.uuid4()),
            job_id=job.id,
            original_label='SPEAKER_00',
            display_name='Speaker 1',
        )
        sp2 = Speaker(
            id=str(uuid.uuid4()),
            job_id=job.id,
            original_label='SPEAKER_01',
            display_name='Speaker 2',
        )
        _db.session.add_all([sp1, sp2])
        _db.session.flush()

        segs = [
            Segment(
                id=str(uuid.uuid4()), job_id=job.id, speaker_id=sp1.id,
                start=0.52, end=4.10,
                text='Thanks everyone for joining today.',
                original_text='Thanks everyone for joining today.',
            ),
            Segment(
                id=str(uuid.uuid4()), job_id=job.id, speaker_id=sp2.id,
                start=4.50, end=7.20,
                text='Happy to be here.',
                original_text='Happy to be here.',
            ),
            Segment(
                id=str(uuid.uuid4()), job_id=job.id, speaker_id=sp1.id,
                start=7.80, end=12.50,
                text='I will follow up by Friday.',
                original_text='I will follow up by Friday.',
            ),
        ]
        _db.session.add_all(segs)

        action = ActionItem(
            id=str(uuid.uuid4()),
            job_id=job.id,
            text='Follow up by Friday',
            assignee='Speaker 1',
            priority='medium',
            timestamp='00:07',
        )
        _db.session.add(action)
        _db.session.commit()

        yield {
            'job_id': job.id,
            'speaker_1_id': sp1.id,
            'speaker_2_id': sp2.id,
            'segment_ids': [s.id for s in segs],
        }


# ─── Integration test fixtures ───────────────────────────────────────────────

MOCK_SPEECH_API_RESPONSE = {
    "language": "en",
    "duration_seconds": 30.5,
    "speakers": [
        {"speaker_id": "SPEAKER_00", "label": "Speaker 1"},
        {"speaker_id": "SPEAKER_01", "label": "Speaker 2"},
    ],
    "segments": [
        {
            "speaker_id": "SPEAKER_00",
            "start_seconds": 0.5,
            "end_seconds": 4.2,
            "text": "Thanks everyone for joining today.",
            "confidence": 0.95,
            "words": [
                {"text": "Thanks",   "start_seconds": 0.52, "end_seconds": 0.88, "confidence": 0.98},
                {"text": "everyone", "start_seconds": 0.90, "end_seconds": 1.30, "confidence": 0.97},
                {"text": "for",      "start_seconds": 1.32, "end_seconds": 1.50, "confidence": 0.99},
                {"text": "joining",  "start_seconds": 1.52, "end_seconds": 1.95, "confidence": 0.96},
                {"text": "today.",   "start_seconds": 1.97, "end_seconds": 2.40, "confidence": 0.95},
            ],
        },
        {
            "speaker_id": "SPEAKER_01",
            "start_seconds": 4.8,
            "end_seconds": 7.3,
            "text": "Happy to be here.",
            "confidence": 0.92,
        },
        {
            "speaker_id": "SPEAKER_00",
            "start_seconds": 7.9,
            "end_seconds": 12.1,
            "text": "I will follow up by Friday.",
            "confidence": 0.97,
        },
    ],
    "action_items": [
        {
            "text": "Follow up by Friday",
            "speaker_label": "SPEAKER_00",
            "priority": "medium",
            "timestamp": "00:07",
        }
    ],
}

MOCK_SPEECH_API_ERROR_RESPONSE = {
    "detail": {"message": "Model not available: large-v99"}
}


@pytest.fixture
def mock_speech_api_success():
    import responses as resp_lib
    with resp_lib.RequestsMock() as rsps:
        rsps.add(resp_lib.GET, 'http://localhost:8000/health',
                 json={'status': 'ok'}, status=200)
        rsps.add(resp_lib.POST, 'http://localhost:8000/process-audio',
                 json=MOCK_SPEECH_API_RESPONSE, status=200)
        yield rsps


@pytest.fixture
def mock_speech_api_error():
    import responses as resp_lib
    with resp_lib.RequestsMock() as rsps:
        rsps.add(resp_lib.GET, 'http://localhost:8000/health',
                 json={'status': 'ok'}, status=200)
        rsps.add(resp_lib.POST, 'http://localhost:8000/process-audio',
                 json=MOCK_SPEECH_API_ERROR_RESPONSE, status=422)
        yield rsps


@pytest.fixture
def mock_speech_api_unreachable():
    import responses as resp_lib
    from requests.exceptions import ConnectionError as ReqConnError
    with resp_lib.RequestsMock() as rsps:
        rsps.add(resp_lib.GET, 'http://localhost:8000/health',
                 body=ReqConnError('connection refused'))
        yield rsps


@pytest.fixture
def queued_job(app):
    """Creates a job row in 'queued' state with a real (empty) audio file on disk."""
    from app import Job, db as _db
    job_id = f'job_{uuid.uuid4().hex[:12]}'
    upload_dir = Path(_TEST_BASE, 'uploads')
    filepath = str(upload_dir / f'{job_id}_test.mp3')
    # Write a minimal fake audio file so open(filepath, 'rb') works
    Path(filepath).write_bytes(b'\xff\xfb' + b'\x00' * 256)
    with app.app_context():
        job = Job(
            id=job_id,
            filename='test.mp3',
            filepath=filepath,
            status='queued',
            transcription_model='base',
        )
        _db.session.add(job)
        _db.session.commit()
    yield job_id


def _get_job_filepath(app_instance, job_id):
    from app import Job, db as _db
    with app_instance.app_context():
        job = _db.session.get(Job, job_id)
        return job.filepath


def _get_job_model(app_instance, job_id):
    from app import Job, db as _db
    with app_instance.app_context():
        job = _db.session.get(Job, job_id)
        return job.transcription_model


def run_job_synchronously(app_instance, job_id, hf_token=None):
    """Call run_job() in the test thread (bypasses threading.Thread)."""
    from app import run_job
    run_job(
        job_id,
        filepath=_get_job_filepath(app_instance, job_id),
        hf_token=hf_token,
        transcription_model=_get_job_model(app_instance, job_id),
    )
