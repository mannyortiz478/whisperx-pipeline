import io
import pytest

pytestmark = pytest.mark.unit


def test_upload_rejects_txt_file(client):
    data = {'file': (io.BytesIO(b'not audio'), 'notes.txt')}
    resp = client.post('/upload', data=data, content_type='multipart/form-data')
    assert resp.status_code == 400
    assert 'error' in resp.get_json()


def test_upload_rejects_missing_file(client):
    resp = client.post('/upload', data={}, content_type='multipart/form-data')
    assert resp.status_code == 400


def test_upload_rejects_empty_filename(client):
    data = {'file': (io.BytesIO(b''), '')}
    resp = client.post('/upload', data=data, content_type='multipart/form-data')
    assert resp.status_code == 400


def test_upload_accepts_mp3(client, mocker):
    mocker.patch('app.threading.Thread')
    data = {'file': (io.BytesIO(b'ID3fake'), 'meeting.mp3')}
    resp = client.post('/upload', data=data, content_type='multipart/form-data')
    assert resp.status_code == 200
    assert 'job_id' in resp.get_json()


def test_upload_accepts_mp4(client, mocker):
    mocker.patch('app.threading.Thread')
    data = {'file': (io.BytesIO(b'fakemp4'), 'meeting.mp4')}
    resp = client.post('/upload', data=data, content_type='multipart/form-data')
    assert resp.status_code == 200


def test_upload_accepts_wav(client, mocker):
    mocker.patch('app.threading.Thread')
    data = {'file': (io.BytesIO(b'RIFF'), 'meeting.wav')}
    resp = client.post('/upload', data=data, content_type='multipart/form-data')
    assert resp.status_code == 200


def test_upload_rejects_pdf(client):
    data = {'file': (io.BytesIO(b'%PDF'), 'doc.pdf')}
    resp = client.post('/upload', data=data, content_type='multipart/form-data')
    assert resp.status_code == 400


def test_upload_creates_job_in_db(client, mocker, app):
    mocker.patch('app.threading.Thread')
    data = {'file': (io.BytesIO(b'ID3fake'), 'meeting.mp3')}
    resp = client.post('/upload', data=data, content_type='multipart/form-data')
    job_id = resp.get_json()['job_id']
    from app import Job, db
    with app.app_context():
        job = db.session.get(Job, job_id)
        assert job is not None
        assert job.filename == 'meeting.mp3'
        assert job.status == 'queued'
