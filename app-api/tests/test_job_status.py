import io
import uuid
import pytest

pytestmark = pytest.mark.unit


def test_status_returns_404_for_unknown_job(client):
    resp = client.get('/status/job_doesnotexist')
    assert resp.status_code == 404


def test_status_returns_completed_job(client, sample_job_with_data):
    job_id = sample_job_with_data['job_id']
    resp = client.get(f'/status/{job_id}')
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['status'] == 'done'
    assert 'result' in data
    assert data['result']['segment_count'] == 3
    assert data['result']['speaker_count'] == 2


def test_status_result_includes_segments(client, sample_job_with_data):
    job_id = sample_job_with_data['job_id']
    resp = client.get(f'/status/{job_id}')
    result = resp.get_json()['result']
    assert len(result['transcript']) == 3
    texts = [s['text'] for s in result['transcript']]
    assert 'Thanks everyone for joining today.' in texts


def test_status_result_includes_speakers(client, sample_job_with_data):
    job_id = sample_job_with_data['job_id']
    resp = client.get(f'/status/{job_id}')
    result = resp.get_json()['result']
    names = [s['display_name'] for s in result['speakers']]
    assert 'Speaker 1' in names
    assert 'Speaker 2' in names


def test_status_result_includes_action_items(client, sample_job_with_data):
    job_id = sample_job_with_data['job_id']
    resp = client.get(f'/status/{job_id}')
    result = resp.get_json()['result']
    assert len(result['action_items']) == 1
    assert result['action_items'][0]['text'] == 'Follow up by Friday'


def test_list_jobs_returns_all_jobs(client, sample_job):
    resp = client.get('/jobs')
    assert resp.status_code == 200
    data = resp.get_json()
    assert len(data['jobs']) >= 1
    job_ids = [j['job_id'] for j in data['jobs']]
    assert sample_job in job_ids


def test_delete_job_removes_from_db(client, sample_job, app):
    resp = client.delete(f'/jobs/{sample_job}')
    assert resp.status_code == 200
    assert resp.get_json()['deleted'] is True
    from app import Job, db
    with app.app_context():
        assert db.session.get(Job, sample_job) is None


def test_retry_fails_on_non_failed_job(client, sample_job):
    # sample_job has status='completed'; retry must reject it
    resp = client.post(f'/jobs/{sample_job}/retry')
    assert resp.status_code == 400


def test_retry_resets_failed_job(client, app, mocker):
    mocker.patch('app.threading.Thread')
    from app import Job, db
    job_id = f'job_{uuid.uuid4().hex[:12]}'
    with app.app_context():
        job = Job(
            id=job_id,
            filename='failed.mp3',
            filepath='/tmp/failed.mp3',
            status='failed',
            error='Speech API timeout',
            transcription_model='base',
        )
        db.session.add(job)
        db.session.commit()

    resp = client.post(f'/jobs/{job_id}/retry')
    assert resp.status_code == 200
    assert resp.get_json()['retried'] is True

    with app.app_context():
        refreshed = db.session.get(Job, job_id)
        assert refreshed.status == 'queued'
        assert refreshed.error is None
