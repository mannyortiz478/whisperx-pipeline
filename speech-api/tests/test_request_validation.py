import io
import pytest
from unittest import mock


@pytest.mark.asyncio
async def test_process_audio_rejects_missing_file(async_client):
    resp = await async_client.post('/process-audio', data={})
    assert resp.status_code == 422  # FastAPI unprocessable entity


@pytest.mark.asyncio
async def test_process_audio_rejects_invalid_model(async_client):
    files = {'file': ('test.mp3', io.BytesIO(b'ID3fake'), 'audio/mpeg')}
    data = {'transcription_model': 'nonexistent_model_xyz'}
    resp = await async_client.post('/process-audio', files=files, data=data)
    assert resp.status_code == 400
    detail = resp.json()['detail']
    assert 'nonexistent_model_xyz' in str(detail)


@pytest.mark.asyncio
async def test_process_audio_valid_model_passes_validation(async_client):
    """A valid model name should not return 400 (validation error).
    It will return 500 in test env since whisperx isn't installed."""
    mock_result = {
        'language': 'en',
        'transcription_model': 'base',
        'duration_seconds': 5.0,
        'speakers': [{'speaker_id': 'SPEAKER_00', 'label': 'Speaker 1'}],
        'segments': [{
            'speaker_id': 'SPEAKER_00',
            'start_seconds': 0.5,
            'end_seconds': 3.0,
            'text': 'Hello world.',
            'confidence': 0.95,
            'words': [],
        }],
        'action_items': [],
    }
    with mock.patch('main.whisperx', create=True), \
         mock.patch('main.torch', create=True), \
         mock.patch('main.extract_action_items', return_value=[]):
        # Without whisperx available, the endpoint will 500, but NOT 400.
        files = {'file': ('test.mp3', io.BytesIO(b'ID3fake'), 'audio/mpeg')}
        data = {'transcription_model': 'base', 'enable_diarization': 'false'}
        resp = await async_client.post('/process-audio', files=files, data=data)
    # Should not be 400 (that's the model-name validation error)
    assert resp.status_code != 400


@pytest.mark.asyncio
async def test_process_audio_rejects_all_unknown_models(async_client):
    for bad_model in ['gpt4', 'whisper-v4', 'invalid']:
        files = {'file': ('test.mp3', io.BytesIO(b'ID3'), 'audio/mpeg')}
        resp = await async_client.post(
            '/process-audio', files=files, data={'transcription_model': bad_model},
        )
        assert resp.status_code == 400, f"Expected 400 for model '{bad_model}'"
