import axios from 'axios';

const api = axios.create({
  baseURL: '/',
  timeout: 7200000, // 2 hours for long uploads
});

export interface Model {
  id: string;
  available: boolean;
}

export interface HealthResponse {
  status: string;
  speech_api: string;
}

export interface ModelsResponse {
  transcription_models: Model[];
  diarization_model: string;
  supports_word_timestamps: boolean;
  supports_diarization: boolean;
}

export interface JobSummary {
  job_id: string;
  filename: string;
  status: string;
  transcription_model: string;
  duration: number | null;
  language: string | null;
  created_at: string;
}

export interface Speaker {
  speaker_id: string;
  original_label: string;
  display_name: string;
}

export interface Segment {
  segment_id: string;
  speaker: string;
  speaker_id: string;
  start: number;
  end: number;
  text: string;
  timestamp: string;
}

export interface ActionItem {
  id: string;
  text: string;
  assignee: string;
  priority: 'high' | 'medium' | 'normal';
  timestamp: string;
  due_date?: string | null;
}

export interface JobStatus {
  status: 'queued' | 'processing' | 'done' | 'error';
  progress: number;
  message: string;
  filename: string;
  result?: {
    job_id: string;
    language: string;
    duration: number;
    speaker_count: number;
    segment_count: number;
    speakers: Speaker[];
    transcript: Segment[];
    action_items: ActionItem[];
    full_text: string;
  };
}

export const apiClient = {
  uploadFile: (file: File, model: string, hfToken?: string) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('transcription_model', model);
    if (hfToken) {
      formData.append('hf_token', hfToken);
    }
    return api.post<{ job_id: string }>('/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  getStatus: (jobId: string) =>
    api.get<JobStatus>(`/status/${jobId}`),

  getJobs: () =>
    api.get<{ jobs: JobSummary[] }>('/jobs'),

  deleteJob: (jobId: string) =>
    api.delete(`/jobs/${jobId}`),

  renameSpeaker: (jobId: string, speakerId: string, displayName: string) =>
    api.patch<Speaker>(`/jobs/${jobId}/speakers/${speakerId}`, {
      display_name: displayName,
    }),

  editSegment: (jobId: string, segmentId: string, text: string) =>
    api.patch<Segment>(`/jobs/${jobId}/segments/${segmentId}`, { text }),

  getModels: () =>
    api.get<ModelsResponse>('/models'),

  getHealth: () =>
    api.get<HealthResponse>('/health'),

  downloadTranscript: (jobId: string) =>
    api.get(`/download/${jobId}/transcript.txt`, { responseType: 'blob' }),
};

export default api;
