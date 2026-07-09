import pytest
from tests.conftest import run_job_synchronously

pytestmark = pytest.mark.integration


class TestExportEndpoints:

    @pytest.fixture(autouse=True)
    def completed_job(self, app, queued_job, mock_speech_api_success):
        run_job_synchronously(app, queued_job)
        self.job_id = queued_job
        self.app = app

    def test_txt_download_returns_200(self, client):
        resp = client.get(f'/download/{self.job_id}/transcript.txt')
        assert resp.status_code == 200

    def test_txt_download_content_type_is_text(self, client):
        resp = client.get(f'/download/{self.job_id}/transcript.txt')
        assert 'text' in resp.content_type

    def test_txt_download_contains_speaker_name(self, client):
        resp = client.get(f'/download/{self.job_id}/transcript.txt')
        content = resp.data.decode('utf-8')
        assert 'Speaker' in content

    def test_txt_download_no_timestamps_omits_brackets(self, client):
        resp = client.get(f'/download/{self.job_id}/transcript.txt?include_timestamps=false')
        assert resp.status_code == 200
        content = resp.data.decode('utf-8')
        assert '[' not in content

    def test_txt_download_with_timestamps_includes_brackets(self, client):
        resp = client.get(f'/download/{self.job_id}/transcript.txt?include_timestamps=true')
        content = resp.data.decode('utf-8')
        assert '[' in content

    def test_docx_export_returns_200(self, client):
        resp = client.get(f'/jobs/{self.job_id}/export/docx')
        assert resp.status_code == 200

    def test_docx_export_content_type_is_docx(self, client):
        resp = client.get(f'/jobs/{self.job_id}/export/docx')
        assert 'openxmlformats' in resp.content_type or 'octet-stream' in resp.content_type

    def test_docx_export_file_is_non_trivial(self, client):
        resp = client.get(f'/jobs/{self.job_id}/export/docx')
        assert len(resp.data) > 1000

    def test_pdf_export_returns_200(self, client):
        resp = client.get(f'/jobs/{self.job_id}/export/pdf')
        assert resp.status_code == 200

    def test_pdf_export_starts_with_pdf_magic_bytes(self, client):
        resp = client.get(f'/jobs/{self.job_id}/export/pdf')
        assert resp.data[:4] == b'%PDF'
