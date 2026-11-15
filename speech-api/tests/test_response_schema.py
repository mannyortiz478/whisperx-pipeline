import pytest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))


def test_segment_schema_has_required_fields():
    seg = {
        'speaker_id': 'SPEAKER_00',
        'start_seconds': 0.5,
        'end_seconds': 3.0,
        'text': 'Hello.',
        'confidence': 0.95,
        'words': [{'text': 'Hello', 'start_seconds': 0.5, 'end_seconds': 0.8, 'confidence': 0.98}],
    }
    for field in ['speaker_id', 'start_seconds', 'end_seconds', 'text']:
        assert field in seg


def test_speaker_schema_has_required_fields():
    speaker = {'speaker_id': 'SPEAKER_00', 'label': 'Speaker 1'}
    assert 'speaker_id' in speaker
    assert 'label' in speaker


def test_action_item_schema_has_required_fields():
    action = {
        'text': 'Follow up on report',
        'speaker_label': 'SPEAKER_00',
        'priority': 'medium',
        'timestamp': '00:07',
        'due_date': None,
    }
    for field in ['text', 'priority', 'timestamp']:
        assert field in action


def test_priority_values_are_valid():
    valid = {'high', 'medium', 'normal'}
    for p in ['high', 'medium', 'normal']:
        assert p in valid


def test_error_response_format():
    error = {'detail': {'code': 'PROCESSING_FAILED', 'message': 'Failed'}}
    assert 'detail' in error
    assert 'code' in error['detail']
    assert 'message' in error['detail']


def test_extract_action_items_returns_list():
    from main import extract_action_items
    segments = [
        {'speaker': 'SPEAKER_00', 'text': "I'll send the report tomorrow.", 'start': 0.5},
        {'speaker': 'SPEAKER_01', 'text': 'Can you review the doc by Friday.', 'start': 5.0},
    ]
    speaker_labels = {'SPEAKER_00': 'Speaker 1', 'SPEAKER_01': 'Speaker 2'}
    items = extract_action_items(segments, speaker_labels)
    assert isinstance(items, list)
    assert len(items) >= 1
    for item in items:
        assert 'text' in item
        assert 'priority' in item
        assert item['priority'] in ('high', 'medium', 'normal')


def test_extract_action_items_with_deadline_pattern():
    from main import extract_action_items
    segments = [
        {
            'speaker': 'SPEAKER_00',
            'text': 'We need to submit the proposal by end of week.',
            'start': 10.0,
        },
    ]
    items = extract_action_items(segments, {'SPEAKER_00': 'Speaker 1'})
    assert isinstance(items, list)


def test_format_timestamp_zero():
    from main import format_timestamp
    assert format_timestamp(0) == '00:00'


def test_format_timestamp_minutes():
    from main import format_timestamp
    assert format_timestamp(90) == '01:30'


def test_format_timestamp_hours():
    from main import format_timestamp
    result = format_timestamp(3661)
    assert '01:01:01' in result


# ─── LLM output validation ───────────────────────────────────────────────────

def test_validate_action_items_drops_malformed_items():
    from main import validate_action_items
    data = [
        "not an object",
        42,
        {'text': ''},
        {'text': '   '},
        {'text': None},
        {'priority': 'high'},
        {'text': 'Send the report'},
    ]
    items = validate_action_items(data)
    assert len(items) == 1
    assert items[0]['text'] == 'Send the report'


def test_validate_action_items_coerces_fields():
    from main import validate_action_items
    items = validate_action_items([
        {'text': 'Fix login bug', 'priority': 'URGENT', 'assignee': '', 'due_date': '  '},
        {'text': 'Ship release', 'priority': 'High', 'assignee': 'Alice', 'due_date': 'Friday'},
        {'text': 'x' * 2000, 'priority': 7, 'assignee': 123},
    ])
    assert items[0]['priority'] == 'normal'
    assert items[0]['assignee'] == 'Team'
    assert items[0]['due_date'] is None
    assert items[1]['priority'] == 'high'
    assert items[1]['assignee'] == 'Alice'
    assert items[1]['due_date'] == 'Friday'
    assert len(items[2]['text']) == 500
    assert items[2]['priority'] == 'normal'
    assert items[2]['assignee'] == 'Team'


def test_validate_action_items_caps_list_and_rejects_non_list():
    from main import validate_action_items
    items = validate_action_items([{'text': f'Task {i}'} for i in range(100)])
    assert len(items) == 25
    assert validate_action_items({'text': 'not a list'}) is None
    assert validate_action_items(None) is None


def test_parse_llm_json_accepts_code_fence():
    from main import _parse_llm_json
    assert _parse_llm_json('[{"text": "a"}]') == [{'text': 'a'}]
    assert _parse_llm_json('```json\n[{"text": "a"}]\n```') == [{'text': 'a'}]
    assert _parse_llm_json('```\n[]\n```') == []


def test_extract_action_items_falls_back_to_regex_when_claude_fails(monkeypatch):
    import sys, types
    import main

    class _Boom:
        def __init__(self, *a, **kw):
            raise RuntimeError('network down')

    monkeypatch.setenv('ANTHROPIC_API_KEY', 'test-key')
    monkeypatch.setitem(sys.modules, 'anthropic', types.SimpleNamespace(Anthropic=_Boom))
    segments = [{'speaker': 'SPEAKER_00', 'text': "I'll send the report tomorrow.", 'start': 0.5}]
    items = main.extract_action_items(segments, {'SPEAKER_00': 'Speaker 1'})
    assert len(items) >= 1
    assert items[0]['speaker_label'] == 'SPEAKER_00'  # regex-shaped output


def test_extract_action_items_falls_back_when_claude_returns_non_list(monkeypatch):
    import sys, types
    import main

    class _Client:
        def __init__(self, *a, **kw):
            self.messages = self
        def create(self, **kw):
            block = types.SimpleNamespace(type='text', text='{"oops": true}')
            return types.SimpleNamespace(content=[block])

    monkeypatch.setenv('ANTHROPIC_API_KEY', 'test-key')
    monkeypatch.setitem(sys.modules, 'anthropic', types.SimpleNamespace(Anthropic=_Client))
    segments = [{'speaker': 'SPEAKER_00', 'text': "I'll send the report tomorrow.", 'start': 0.5}]
    items = main.extract_action_items(segments, {'SPEAKER_00': 'Speaker 1'})
    assert items and 'speaker_label' in items[0]
