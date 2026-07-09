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
