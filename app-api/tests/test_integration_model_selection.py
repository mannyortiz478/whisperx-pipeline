import io
import pytest
import uuid
from pathlib import Path
from tests.conftest import MOCK_SPEECH_API_RESPONSE, run_job_synchronously

pytestmark = pytest.mark.integration

_FAKE_AUDIO = b'\xff\xfb' + b'\x00' * 256


class TestModelSelection:

    def _create_queued_job(self, app, model):
        from app import Job, db as _db
        import app as app_module
        job_id = f'job_{uuid.uuid4().hex[:12]}'
        upload_dir = app_module.UPLOAD_DIR
        filepath = str(upload_dir / f'{job_id}_test.mp3')
        Path(filepath).write_bytes(_FAKE_AUDIO)
        with app.app_context():
            job = Job(
                id=job_id,
                filename='test.mp3',
                filepath=filepath,
                status='queued',
                transcription_model=model,
            )
            _db.session.add(job)
            _db.session.commit()
        return job_id

    def test_upload_stores_selected_model(self, app, client, mocker):
        mocker.patch('app.threading.Thread')
        data = {
            'file': (io.BytesIO(_FAKE_AUDIO), 'meeting.mp3'),
            'transcription_model': 'large-v3',
        }
        resp = client.post('/upload', data=data, content_type='multipart/form-data')
        job_id = resp.get_json()['job_id']
        from app import Job, db as _db
        with app.app_context():
            job = _db.session.get(Job, job_id)
            assert job.transcription_model == 'large-v3'

    def test_run_job_completes_with_base_model(self, app, mock_speech_api_success):
        job_id = self._create_queued_job(app, 'base')
        run_job_synchronously(app, job_id)
        from app import Job, db as _db
        with app.app_context():
            job = _db.session.get(Job, job_id)
            assert job.status == 'completed'

    def test_run_job_completes_with_large_model(self, app, mock_speech_api_success):
        job_id = self._create_queued_job(app, 'large-v3')
        run_job_synchronously(app, job_id)
        from app import Job, db as _db
        with app.app_context():
            job = _db.session.get(Job, job_id)
            assert job.status == 'completed'

    def test_model_stored_in_job_summary(self, app, client, mocker):
        mocker.patch('app.threading.Thread')
        data = {
            'file': (io.BytesIO(_FAKE_AUDIO), 'meeting.mp3'),
            'transcription_model': 'small',
        }
        resp = client.post('/upload', data=data, content_type='multipart/form-data')
        job_id = resp.get_json()['job_id']
        jobs_resp = client.get('/jobs')
        jobs = jobs_resp.get_json()['jobs']
        matching = [j for j in jobs if j['job_id'] == job_id]
        assert len(matching) == 1
        assert matching[0]['transcription_model'] == 'small'
