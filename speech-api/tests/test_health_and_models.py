import pytest


@pytest.mark.asyncio
async def test_health_returns_ok(async_client):
    resp = await async_client.get('/health')
    assert resp.status_code == 200
    data = resp.json()
    assert data['status'] == 'ok'
    assert 'models_available' in data


@pytest.mark.asyncio
async def test_models_endpoint_returns_list(async_client):
    resp = await async_client.get('/models')
    assert resp.status_code == 200
    data = resp.json()
    assert 'transcription_models' in data
    assert len(data['transcription_models']) > 0


@pytest.mark.asyncio
async def test_models_include_base(async_client):
    resp = await async_client.get('/models')
    model_ids = [m['id'] for m in resp.json()['transcription_models']]
    assert 'base' in model_ids


@pytest.mark.asyncio
async def test_models_all_have_available_field(async_client):
    resp = await async_client.get('/models')
    for m in resp.json()['transcription_models']:
        assert 'id' in m
        assert 'available' in m


@pytest.mark.asyncio
async def test_health_reports_supported_models(async_client):
    resp = await async_client.get('/health')
    data = resp.json()
    assert isinstance(data['models_available'], list)
    assert len(data['models_available']) > 0
