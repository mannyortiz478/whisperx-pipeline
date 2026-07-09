import sys
from pathlib import Path

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport

sys.path.insert(0, str(Path(__file__).parent.parent))
from main import app


@pytest_asyncio.fixture
async def async_client():
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url='http://test',
    ) as client:
        yield client
