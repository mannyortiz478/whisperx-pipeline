import pytest

pytestmark = pytest.mark.unit


def test_rename_speaker_updates_display_name(client, sample_job_with_data):
    job_id = sample_job_with_data['job_id']
    spk_id = sample_job_with_data['speaker_1_id']
    resp = client.patch(
        f'/jobs/{job_id}/speakers/{spk_id}',
        json={'display_name': 'Alex'},
    )
    assert resp.status_code == 200
    assert resp.get_json()['display_name'] == 'Alex'


def test_rename_speaker_persists_in_db(client, sample_job_with_data, app):
    job_id = sample_job_with_data['job_id']
    spk_id = sample_job_with_data['speaker_1_id']
    client.patch(f'/jobs/{job_id}/speakers/{spk_id}', json={'display_name': 'Alex'})
    from app import Speaker, db
    with app.app_context():
        sp = db.session.get(Speaker, spk_id)
        assert sp.display_name == 'Alex'


def test_rename_speaker_returns_404_for_wrong_job(client, sample_job_with_data):
    spk_id = sample_job_with_data['speaker_1_id']
    resp = client.patch(
        f'/jobs/job_wrongjob/speakers/{spk_id}',
        json={'display_name': 'Alex'},
    )
    assert resp.status_code == 404


def test_rename_speaker_rejects_empty_name(client, sample_job_with_data):
    job_id = sample_job_with_data['job_id']
    spk_id = sample_job_with_data['speaker_1_id']
    resp = client.patch(
        f'/jobs/{job_id}/speakers/{spk_id}',
        json={'display_name': ''},
    )
    assert resp.status_code == 400


def test_edit_segment_updates_text(client, sample_job_with_data):
    job_id = sample_job_with_data['job_id']
    seg_id = sample_job_with_data['segment_ids'][0]
    resp = client.patch(
        f'/jobs/{job_id}/segments/{seg_id}',
        json={'text': 'Thanks everyone for joining us today.'},
    )
    assert resp.status_code == 200
    assert resp.get_json()['text'] == 'Thanks everyone for joining us today.'


def test_edit_segment_persists_in_db(client, sample_job_with_data, app):
    job_id = sample_job_with_data['job_id']
    seg_id = sample_job_with_data['segment_ids'][0]
    client.patch(f'/jobs/{job_id}/segments/{seg_id}', json={'text': 'Updated text.'})
    from app import Segment, db
    with app.app_context():
        seg = db.session.get(Segment, seg_id)
        assert seg.text == 'Updated text.'
        assert seg.original_text == 'Thanks everyone for joining today.'


def test_edit_segment_returns_404_for_wrong_job(client, sample_job_with_data):
    seg_id = sample_job_with_data['segment_ids'][0]
    resp = client.patch(
        f'/jobs/job_wrongjob/segments/{seg_id}',
        json={'text': 'Something'},
    )
    assert resp.status_code == 404


def test_edit_segment_rejects_empty_text(client, sample_job_with_data):
    job_id = sample_job_with_data['job_id']
    seg_id = sample_job_with_data['segment_ids'][0]
    resp = client.patch(
        f'/jobs/{job_id}/segments/{seg_id}',
        json={'text': ''},
    )
    assert resp.status_code == 400
