import pytest
from tests.conftest import run_job_synchronously

pytestmark = pytest.mark.integration


class TestTranscriptEditPersistence:

    @pytest.fixture(autouse=True)
    def completed_job(self, app, queued_job, mock_speech_api_success):
        run_job_synchronously(app, queued_job)
        self.job_id = queued_job
        self.app = app

    def _get_speakers(self):
        from app import Job, db as _db
        with self.app.app_context():
            job = _db.session.get(Job, self.job_id)
            return [(sp.id, sp.display_name, sp.original_label) for sp in job.speakers]

    def _get_segments(self):
        from app import Job, db as _db
        with self.app.app_context():
            job = _db.session.get(Job, self.job_id)
            return [(seg.id, seg.text, seg.original_text) for seg in job.segments]

    def test_rename_speaker_persists_display_name(self, client):
        speakers = self._get_speakers()
        speaker_id = speakers[0][0]
        resp = client.patch(
            f'/jobs/{self.job_id}/speakers/{speaker_id}',
            json={'display_name': 'Alice'}
        )
        assert resp.status_code == 200
        updated = self._get_speakers()
        names = [sp[1] for sp in updated]
        assert 'Alice' in names

    def test_rename_speaker_reflected_in_status_response(self, client):
        speakers = self._get_speakers()
        speaker_id, _, original_label = speakers[0]
        client.patch(
            f'/jobs/{self.job_id}/speakers/{speaker_id}',
            json={'display_name': 'Bob'}
        )
        body = client.get(f'/status/{self.job_id}').get_json()
        result_speakers = body['result']['speakers']
        names = [sp['display_name'] for sp in result_speakers]
        assert 'Bob' in names

    def test_edit_segment_text_persists(self, client):
        segments = self._get_segments()
        seg_id = segments[0][0]
        resp = client.patch(
            f'/jobs/{self.job_id}/segments/{seg_id}',
            json={'text': 'Hello world updated'}
        )
        assert resp.status_code == 200
        updated = self._get_segments()
        texts = [seg[1] for seg in updated]
        assert 'Hello world updated' in texts

    def test_edit_segment_preserves_original_text(self, client):
        segments = self._get_segments()
        seg_id, original_text, _ = segments[0]
        client.patch(
            f'/jobs/{self.job_id}/segments/{seg_id}',
            json={'text': 'Completely different text'}
        )
        updated = self._get_segments()
        original_texts = [seg[2] for seg in updated]
        assert original_text in original_texts

    def test_multiple_speaker_renames_all_persist(self, client):
        speakers = self._get_speakers()
        for i, (sp_id, _, _) in enumerate(speakers):
            client.patch(
                f'/jobs/{self.job_id}/speakers/{sp_id}',
                json={'display_name': f'Person {i + 1}'}
            )
        updated = self._get_speakers()
        names = {sp[1] for sp in updated}
        assert 'Person 1' in names
        assert 'Person 2' in names

    def test_edit_segment_returns_updated_text_in_response(self, client):
        segments = self._get_segments()
        seg_id = segments[1][0]
        resp = client.patch(
            f'/jobs/{self.job_id}/segments/{seg_id}',
            json={'text': 'Revised segment text'}
        )
        assert resp.status_code == 200
        data = resp.get_json()
        assert data['text'] == 'Revised segment text'
