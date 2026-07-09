import type { TranscriptResult } from './transcript';

export interface JobProgressResponse {
  status:   'queued' | 'processing';
  progress: number;
  message:  string | null;
  filename: string;
}

export interface JobCompleteResponse {
  status:   'done';
  progress: number;
  message:  string;
  filename: string;
  result:   TranscriptResult;
}

export interface JobErrorResponse {
  status:   'error';
  progress: number;
  message:  string;
  filename: string;
}

export type StatusResponse =
  | JobProgressResponse
  | JobCompleteResponse
  | JobErrorResponse;

export interface TranscriptionModel {
  id:        string;
  available: boolean;
}

export interface ModelsResponse {
  transcription_models:     TranscriptionModel[];
  diarization_model?:       string;
  supports_word_timestamps?: boolean;
  supports_diarization?:    boolean;
}

export interface HealthResponse {
  status:     string;
  speech_api: string;
}

export function isJobComplete(r: StatusResponse): r is JobCompleteResponse {
  return r.status === 'done';
}

export function isJobError(r: StatusResponse): r is JobErrorResponse {
  return r.status === 'error';
}

export function isJobInProgress(r: StatusResponse): r is JobProgressResponse {
  return r.status === 'queued' || r.status === 'processing';
}
