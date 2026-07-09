import axios from 'axios';
import type {
  StatusResponse,
  ModelsResponse,
  HealthResponse,
  Speaker,
  JobSummary,
  RetryResponse,
  TranscriptSegment,
} from '@whisperx/shared-types';

// Re-export all shared types so existing imports from this module continue to work
export type {
  Speaker,
  RenameSpeakerRequest,
  RenameSpeakerResponse,
  JobStatus,
  Job,
  JobSummary,
  JobListResponse,
  UploadResponse,
  RetryResponse,
  DeleteResponse,
  TranscriptWord,
  TranscriptSegment,
  ActionItem,
  TranscriptResult,
  UpdateSegmentRequest,
  UpdateSegmentResponse,
  StatusResponse,
  JobProgressResponse,
  JobCompleteResponse,
  JobErrorResponse,
  TranscriptionModel,
  ModelsResponse,
  HealthResponse,
} from '@whisperx/shared-types';

export {
  isJobComplete,
  isJobError,
  isJobInProgress,
} from '@whisperx/shared-types';

const api = axios.create({
  baseURL: '/',
  timeout: 7200000, // 2 hours for long uploads
});

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
    api.get<StatusResponse>(`/status/${jobId}`),

  getJobs: () =>
    api.get<{ jobs: JobSummary[] }>('/jobs'),

  deleteJob: (jobId: string) =>
    api.delete<{ deleted: boolean }>(`/jobs/${jobId}`),

  renameSpeaker: (jobId: string, speakerId: string, displayName: string) =>
    api.patch<Speaker>(`/jobs/${jobId}/speakers/${speakerId}`, {
      display_name: displayName,
    }),

  editSegment: (jobId: string, segmentId: string, text: string) =>
    api.patch<TranscriptSegment>(`/jobs/${jobId}/segments/${segmentId}`, { text }),

  getModels: () =>
    api.get<ModelsResponse>('/models'),

  getHealth: () =>
    api.get<HealthResponse>('/health'),

  downloadTranscript: (jobId: string) =>
    api.get(`/download/${jobId}/transcript.txt`, { responseType: 'blob' }),

  retryJob: (jobId: string) =>
    api.post<RetryResponse>(`/jobs/${jobId}/retry`),
};

export default api;
