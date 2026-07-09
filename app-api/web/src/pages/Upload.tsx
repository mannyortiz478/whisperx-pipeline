import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiUpload } from '../lib/api';
import { apiClient } from '../utils/api';

const MAX_FILE_BYTES = 100 * 1024 * 1024; // 100 MB client-side guard
const ALLOWED_EXTS = new Set(['mp3', 'mp4', 'wav', 'm4a', 'ogg', 'flac', 'webm', 'mkv']);
const ALLOWED_TYPES = new Set([
  'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-wav', 'audio/wave',
  'audio/ogg', 'audio/flac', 'audio/x-flac', 'audio/webm', 'audio/x-m4a',
  'video/mp4', 'video/webm', 'video/x-matroska', 'video/quicktime',
]);

function validateFile(f: File): string | null {
  const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
  if (!ALLOWED_EXTS.has(ext) && !ALLOWED_TYPES.has(f.type)) {
    return `Unsupported file type. Allowed formats: MP3, MP4, WAV, M4A, OGG, FLAC, WEBM, MKV`;
  }
  if (f.size > MAX_FILE_BYTES) {
    return `File too large (${(f.size / 1024 / 1024).toFixed(0)} MB). Maximum allowed size is 100 MB.`;
  }
  return null;
}

export const Upload: React.FC = () => {
  const navigate     = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [model, setModel] = useState('base');
  const [hfToken, setHfToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const { data: models } = useQuery({
    queryKey: ['models'],
    queryFn: () => apiClient.getModels(),
    select: (res) => res.data,
  });

  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: () => apiClient.getHealth(),
    select: (res) => res.data,
    refetchInterval: 3000,
  });

  const speechApiHealthy = health?.speech_api === 'ok';

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) {
      const err = validateFile(e.dataTransfer.files[0]);
      if (err) { setErrorMsg(err); setFile(null); }
      else { setFile(e.dataTransfer.files[0]); setErrorMsg(''); }
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    if (file.size > MAX_FILE_BYTES) {
      setErrorMsg(`File too large (${(file.size / 1024 / 1024).toFixed(0)} MB). Maximum allowed size is 100 MB.`);
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    setErrorMsg('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('transcription_model', model);
      if (hfToken) formData.append('hf_token', hfToken);

      const response = await apiUpload('/upload', formData, setUploadProgress) as { job_id: string };
      navigate(`/jobs/${response.job_id}`);
    } catch (error: unknown) {
      const serverMsg = error instanceof Error ? error.message : 'Unknown error';
      setErrorMsg(`Upload failed: ${serverMsg}`);
      setUploading(false);
      setUploadProgress(0);
    }
  };

  return (
    <div className="min-h-screen bg-bg p-4 sm:p-8">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl sm:text-4xl font-sans font-bold text-white mb-2">
            Upload Audio
          </h1>
          <p className="text-muted text-sm sm:text-base">
            Transcribe and analyze your meeting recordings
          </p>
        </div>

        <div className="space-y-6">
          {/* Health Status */}
          <div className="flex items-center gap-2 text-sm">
            <div
              className={`w-2 h-2 rounded-full transition-all ${
                speechApiHealthy ? 'bg-green pulse-slow' : 'bg-red'
              }`}
            />
            <span className="text-muted" data-testid="speech-api-status">
              Speech API: {speechApiHealthy ? 'Ready' : 'Offline'}
            </span>
          </div>

          {/* Drag and Drop Zone */}
          <div
            role="button"
            tabIndex={0}
            aria-label="Upload audio file. Press Enter or Space to browse files."
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-md p-8 sm:p-12 text-center transition-colors cursor-pointer ${
              dragActive
                ? 'border-accent bg-accent/5'
                : 'border-dim hover:border-accent'
            }`}
          >
            <div className="space-y-4">
              <div className="text-4xl sm:text-5xl text-dim">
                {file ? '📁' : '📥'}
              </div>
              <div>
                <p className="text-white font-sans font-medium">
                  {file ? file.name : 'Drag or click to upload'}
                </p>
                {!file && (
                  <p className="text-sm text-muted mt-1">
                    MP3, MP4, WAV, M4A, OGG, FLAC, WEBM, MKV
                  </p>
                )}
              </div>
              {!file && (
                <>
                  <label htmlFor="file-upload" className="sr-only">
                    Choose audio file (MP3, MP4, WAV, M4A, OGG, FLAC, WEBM, MKV)
                  </label>
                  <input
                    ref={fileInputRef}
                    id="file-upload"
                    data-testid="file-input"
                    type="file"
                    accept="audio/*,video/*,.mp3,.mp4,.wav,.m4a,.ogg,.flac,.webm,.mkv"
                    aria-describedby={errorMsg ? 'file-error' : undefined}
                    onChange={(e) => {
                      if (e.target.files?.[0]) {
                        const err = validateFile(e.target.files[0]);
                        if (err) { setErrorMsg(err); setFile(null); }
                        else { setFile(e.target.files[0]); setErrorMsg(''); }
                      }
                    }}
                    className="hidden"
                  />
                  <label htmlFor="file-upload" className="inline-block cursor-pointer">
                    <span className="px-4 py-2 bg-accent text-bg font-sans font-medium rounded hover:opacity-90 transition inline-block">
                      Select File
                    </span>
                  </label>
                </>
              )}
            </div>
          </div>

          {/* Inline error message */}
          {errorMsg && (
            <div
              role="alert"
              aria-live="polite"
              id="file-error"
              data-testid="upload-error"
              className="p-3 bg-red/10 border border-red rounded text-red text-sm font-sans"
            >
              {errorMsg}
            </div>
          )}

          {/* Model Selection */}
          <div>
            <label htmlFor="model-select" className="block text-sm font-mono text-muted mb-2">
              Transcription Model
            </label>
            <select
              id="model-select"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full bg-surface2 border border-subtle text-white px-4 py-2 rounded font-sans focus:outline-none focus:border-accent transition"
            >
              {models?.transcription_models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id} {m.available ? '' : '(unavailable)'}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted mt-1">
              Larger models are more accurate but slower
            </p>
          </div>

          {/* HF Token */}
          <div>
            <label htmlFor="hf-token" className="block text-sm font-mono text-muted mb-2">
              HuggingFace Token (optional, for speaker diarization)
            </label>
            <div className="relative">
              <input
                id="hf-token"
                type={showToken ? 'text' : 'password'}
                value={hfToken}
                onChange={(e) => setHfToken(e.target.value)}
                placeholder="hf_..."
                className="w-full bg-surface2 border border-subtle text-white px-4 py-2 rounded font-mono focus:outline-none focus:border-accent transition pr-10"
              />
              <button
                onClick={() => setShowToken(!showToken)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-accent transition text-sm"
              >
                {showToken ? '👁' : '👁‍🗨'}
              </button>
            </div>
            <p className="text-xs text-muted mt-1">
              Required for speaker diarization
            </p>
          </div>

          {/* Upload Button */}
          <button
            data-testid="upload-btn"
            onClick={handleUpload}
            disabled={!file || uploading || !speechApiHealthy}
            aria-disabled={!file || uploading || !speechApiHealthy}
            aria-describedby="upload-hint"
            className={`w-full py-3 font-sans font-medium rounded transition ${
              file && !uploading && speechApiHealthy
                ? 'bg-accent text-bg hover:opacity-90 cursor-pointer'
                : 'bg-dim text-muted cursor-not-allowed opacity-50'
            }`}
          >
            {uploading ? 'Uploading...' : 'Upload & Transcribe'}
          </button>
          <span id="upload-hint" className="sr-only">
            {!file ? 'Select a file before uploading' : ''}
          </span>

          {/* Upload Progress */}
          {uploading && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs font-mono text-muted">
                <span>Uploading...</span>
                <span>{uploadProgress}%</span>
              </div>
              <div
                data-testid="upload-progress"
                role="progressbar"
                aria-valuenow={uploadProgress}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Upload progress"
                className="w-full bg-surface rounded-full h-2 overflow-hidden"
              >
                <div
                  className="bg-accent h-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
