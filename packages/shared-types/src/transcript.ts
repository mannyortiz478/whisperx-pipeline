import type { Speaker } from './speaker';

export interface TranscriptWord {
  word_id:    string;
  text:       string;
  start:      number;
  end:        number;
  confidence: number | null;
  word_index: number;
}

export interface TranscriptSegment {
  segment_id: string;
  speaker:    string;
  speaker_id: string;
  start:      number;
  end:        number;
  text:       string;
  timestamp:  string;
  words:      TranscriptWord[];
}

export interface ActionItem {
  id:        string;
  text:      string;
  assignee:  string | null;
  priority:  'high' | 'medium' | 'normal';
  timestamp: string | null;
  due_date:  string | null;
}

export interface TranscriptResult {
  job_id:        string;
  language:      string | null;
  duration:      number | null;
  speaker_count: number;
  segment_count: number;
  speakers:      Speaker[];
  transcript:    TranscriptSegment[];
  action_items:  ActionItem[];
  full_text:     string;
}

export interface UpdateSegmentRequest {
  text: string;
}

export interface UpdateSegmentResponse {
  segment_id: string;
  text:       string;
  updated_at: string;
}
