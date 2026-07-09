import io
import pytest
from pathlib import Path
from tests.conftest import MOCK_SPEECH_API_RESPONSE, run_job_synchronously

pytestmark = pytest.mark.integration

_FAKE_AUDIO = b'\xff\xfb' + b'\x00' * 256


class TestJobCreationAndCompletion:

    def test_upload_creates_queued_job(self, client, mocker):
        mocker.patch('app.threading.Thread')
        data = {'file': (io.BytesIO(_FAKE_AUDIO), 'meeting.mp3')}
        resp = client.post('/upload', data=data, content_type='multipart/form-data')
        assert resp.status_code == 200
        body = resp.get_json()
        assert 'job_id' in body

    def test_queued_job_status_endpoint(self, client, mocker):
        mocker.patch('app.threading.Thread')
        data = {'file': (io.BytesIO(_FAKE_AUDIO), 'meeting.mp3')}
        resp = client.post('/upload', data=data, content_type='multipart/form-data')
        job_id = resp.get_json()['job_id']
        status_resp = client.get(f'/status/{job_id}')
        assert status_resp.status_code == 200

    def test_run_job_sets_status_completed(self, app, queued_job, mock_speech_api_success):
        run_job_synchronously(app, queued_job)
        from app import Job, db as _db
        with app.app_context():
            job = _db.session.get(Job, queued_job)
            assert job.status == 'completed'

    def test_run_job_persists_speakers(self, app, queued_job, mock_speech_api_success):
        run_job_synchronously(app, queued_job)
        from app import Job, db as _db
        with app.app_context():
            job = _db.session.get(Job, queued_job)
            assert len(job.speakers) == 2
            labels = {sp.original_label for sp in job.speakers}
            assert labels == {'SPEAKER_00', 'SPEAKER_01'}

    def test_run_job_persists_segments(self, app, queued_job, mock_speech_api_success):
        run_job_synchronously(app, queued_job)
        from app import Job, db as _db
        with app.app_context():
            job = _db.session.get(Job, queued_job)
            assert len(job.segments) == 3

    def test_run_job_persists_action_items(self, app, queued_job, mock_speech_api_success):
        run_job_synchronously(app, queued_job)
        from app import Job, db as _db
        with app.app_context():
            job = _db.session.get(Job, queued_job)
            assert len(job.actions) == 1
            assert 'Friday' in job.actions[0].text

    def test_run_job_sets_language_and_duration(self, app, queued_job, mock_speech_api_success):
        run_job_synchronously(app, queued_job)
        from app import Job, db as _db
        with app.app_context():
            job = _db.session.get(Job, queued_job)
            assert job.language == 'en'
            assert abs(job.duration - 30.5) < 0.01

    def test_status_endpoint_returns_done_after_completion(self, app, client, queued_job, mock_speech_api_success):
        run_job_synchronously(app, queued_job)
        resp = client.get(f'/status/{queued_job}')
        assert resp.status_code == 200
        body = resp.get_json()
        assert body['status'] == 'done'

    def test_status_result_contains_speakers_and_transcript(self, app, client, queued_job, mock_speech_api_success):
        run_job_synchronously(app, queued_job)
        body = client.get(f'/status/{queued_job}').get_json()
        result = body['result']
        assert len(result['speakers']) == 2
        assert len(result['transcript']) == 3

    def test_transcript_txt_file_created(self, app, queued_job, mock_speech_api_success):
        run_job_synchronously(app, queued_job)
        import app as app_module
        txt_path = app_module.OUTPUT_DIR / queued_job / 'transcript.txt'
        assert txt_path.exists()
        content = txt_path.read_text()
        assert 'Thanks everyone' in content

    def test_run_job_persists_word_timestamps(self, app, queued_job, mock_speech_api_success):
        run_job_synchronously(app, queued_job)
        from app import Segment, db as _db
        with app.app_context():
            first_seg = _db.session.query(Segment).filter_by(job_id=queued_job).order_by(Segment.start).first()
            assert first_seg is not None
            assert len(first_seg.words) == 5
            words = sorted(first_seg.words, key=lambda w: w.word_index)
            assert words[0].text == 'Thanks'
            assert words[0].start == pytest.approx(0.52)
            assert words[0].end == pytest.approx(0.88)
            assert words[0].confidence == pytest.approx(0.98)

    def test_words_included_in_status_response(self, app, client, queued_job, mock_speech_api_success):
        run_job_synchronously(app, queued_job)
        resp = client.get(f'/status/{queued_job}')
        transcript = resp.get_json()['result']['transcript']
        first_seg = transcript[0]
        assert 'words' in first_seg
        assert len(first_seg['words']) == 5
        assert first_seg['words'][0]['text'] == 'Thanks'


class TestJobFailureHandling:

    def test_run_job_sets_status_failed_on_api_error(self, app, queued_job, mock_speech_api_error):
        run_job_synchronously(app, queued_job)
        from app import Job, db as _db
        with app.app_context():
            job = _db.session.get(Job, queued_job)
            assert job.status == 'failed'

    def test_run_job_records_error_message(self, app, queued_job, mock_speech_api_error):
        run_job_synchronously(app, queued_job)
        from app import Job, db as _db
        with app.app_context():
            job = _db.session.get(Job, queued_job)
            assert job.error is not None
            assert len(job.error) > 0

    def test_run_job_sets_status_failed_when_unreachable(self, app, queued_job, mock_speech_api_unreachable):
        run_job_synchronously(app, queued_job)
        from app import Job, db as _db
        with app.app_context():
            job = _db.session.get(Job, queued_job)
            assert job.status == 'failed'

    def test_status_endpoint_returns_error_after_failure(self, app, client, queued_job, mock_speech_api_error):
        run_job_synchronously(app, queued_job)
        resp = client.get(f'/status/{queued_job}')
        assert resp.status_code == 200
        assert resp.get_json()['status'] == 'error'

    def test_retry_reruns_job_successfully(self, app, client, queued_job, mock_speech_api_error, mocker):
        run_job_synchronously(app, queued_job)
        from app import Job, db as _db
        with app.app_context():
            job = _db.session.get(Job, queued_job)
            assert job.status == 'failed'

        # Patch thread so the retry doesn't kick off a real background job
        mocker.patch('app.threading.Thread')
        retry_resp = client.post(f'/jobs/{queued_job}/retry')
        assert retry_resp.status_code == 200
        assert retry_resp.get_json()['retried'] is True

        # Verify the job was reset to queued in the DB
        with app.app_context():
            job = _db.session.get(Job, queued_job)
            assert job.status == 'queued'
