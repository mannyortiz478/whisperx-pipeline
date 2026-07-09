import type {
  Speaker,
  TranscriptSegment,
  ActionItem,
  TranscriptResult,
  JobSummary,
  JobCompleteResponse,
} from '@whisperx/shared-types';

export const makeJob = (overrides: Partial<JobSummary> = {}): JobSummary => ({
  job_id:              'job_test123',
  filename:            'meeting.mp3',
  status:              'completed',
  duration:            125.4,
  language:            'en',
  transcription_model: 'base',
  created_at:          '2026-01-01T10:00:00Z',
  ...overrides,
});

export const makeSpeaker = (overrides: Partial<Speaker> = {}): Speaker => ({
  speaker_id:     'spk_001',
  original_label: 'SPEAKER_00',
  display_name:   'Speaker 1',
  ...overrides,
});

export const makeSegment = (overrides: Partial<TranscriptSegment> = {}): TranscriptSegment => ({
  segment_id: 'seg_001',
  speaker:    'Speaker 1',
  speaker_id: 'spk_001',
  start:      0.52,
  end:        4.10,
  text:       'Thanks everyone for joining today.',
  timestamp:  '00:00',
  words:      [],
  ...overrides,
});

export const makeActionItem = (overrides: Partial<ActionItem> = {}): ActionItem => ({
  id:        'action_001',
  text:      'Follow up on the report by Friday',
  assignee:  'Speaker 1',
  priority:  'medium',
  timestamp: '00:09',
  due_date:  null,
  ...overrides,
});

export const makeTranscriptResult = (overrides: Partial<TranscriptResult> = {}): TranscriptResult => ({
  job_id:        'job_test123',
  language:      'en',
  duration:      125.4,
  speaker_count: 2,
  segment_count: 3,
  speakers: [
    makeSpeaker({ speaker_id: 'spk_001', display_name: 'Speaker 1' }),
    makeSpeaker({ speaker_id: 'spk_002', original_label: 'SPEAKER_01', display_name: 'Speaker 2' }),
  ],
  transcript: [
    makeSegment({
      segment_id: 'seg_001', speaker_id: 'spk_001',
      text: 'Thanks everyone for joining today.', start: 0.52, end: 4.10, timestamp: '00:00',
    }),
    makeSegment({
      segment_id: 'seg_002', speaker_id: 'spk_002', speaker: 'Speaker 2',
      text: 'Happy to be here.', start: 4.50, end: 7.20, timestamp: '00:04',
    }),
    makeSegment({
      segment_id: 'seg_003', speaker_id: 'spk_001',
      text: 'I will follow up by Friday.', start: 7.80, end: 12.50, timestamp: '00:07',
    }),
  ],
  action_items: [makeActionItem()],
  full_text:    'Thanks everyone for joining today. Happy to be here. I will follow up by Friday.',
  ...overrides,
});

export const makeCompletedStatus = (overrides: Partial<JobCompleteResponse> = {}): JobCompleteResponse => ({
  status:   'done',
  progress: 100,
  message:  'Complete!',
  filename: 'meeting.mp3',
  result:   makeTranscriptResult(),
  ...overrides,
});
