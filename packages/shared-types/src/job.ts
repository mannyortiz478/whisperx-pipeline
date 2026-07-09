export type JobStatus =
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface Job {
  job_id:              string;
  filename:            string;
  status:              JobStatus;
  transcription_model: string | null;
  language:            string | null;
  duration:            number | null;
  error?:              string | null;
  created_at:          string;  // ISO datetime
  started_at?:         string | null;
  completed_at?:       string | null;
  failed_at?:          string | null;
}

export interface JobSummary {
  job_id:              string;
  filename:            string;
  status:              JobStatus;
  transcription_model: string | null;
  duration:            number | null;
  language:            string | null;
  created_at:          string;
}

export interface JobListResponse {
  jobs: JobSummary[];
}

export interface UploadResponse {
  job_id: string;
}

export interface RetryResponse {
  job_id:   string;
  status:   JobStatus;
  retried:  boolean;
}

export interface DeleteResponse {
  deleted: boolean;
}
