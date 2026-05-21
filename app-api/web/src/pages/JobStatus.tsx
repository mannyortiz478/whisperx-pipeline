import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../utils/api';

export const JobStatus: React.FC = () => {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const [retrying, setRetrying] = useState(false);

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await apiClient.retryJob(jobId!);
      // Let the existing refetchInterval pick up the new queued status naturally.
      // Navigate to the same page to force a clean remount and restart polling.
      navigate(0);
    } catch {
      setRetrying(false);
    }
  };

  const { data: status, isLoading, isError } = useQuery({
    queryKey: ['status', jobId],
    queryFn: () => apiClient.getStatus(jobId!),
    select: (res) => res.data,
    refetchInterval: jobId ? 1500 : false,
    enabled: !!jobId,
  });

  useEffect(() => {
    if (status?.status === 'done') {
      const timer = setTimeout(() => {
        navigate(`/jobs/${jobId}/transcript`);
      }, 500);
      return () => clearTimeout(timer);
    }
    if (status?.status === 'error') {
      // Stay on error page
    }
  }, [status?.status, navigate, jobId]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4">⏳</div>
          <p className="text-muted">Loading job status...</p>
        </div>
      </div>
    );
  }

  if (isError || !status) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4">❌</div>
          <p className="text-red mb-4">Failed to load job</p>
          <button
            onClick={() => navigate('/')}
            className="text-accent hover:underline"
          >
            Back to upload
          </button>
        </div>
      </div>
    );
  }

  const steps = [
    { name: 'Model Loading', icon: '🔧' },
    { name: 'Transcription', icon: '📝' },
    { name: 'Alignment', icon: '⚙️' },
    { name: 'Diarization', icon: '🎤' },
    { name: 'Extraction', icon: '📋' },
  ];

  const currentStepIndex = Math.floor((status.progress || 0) / 20);

  return (
    <div className="min-h-screen bg-bg p-4 sm:p-8">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl sm:text-4xl font-sans font-bold text-white mb-2">
            Processing...
          </h1>
          <p className="text-muted text-sm sm:text-base">{status.filename}</p>
        </div>

        {/* Progress Bar */}
        <div className="mb-8 space-y-2">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-mono text-muted">{status.message}</span>
            <span className="text-sm font-mono text-accent">{status.progress}%</span>
          </div>
          <div className="w-full bg-surface rounded-full h-3 overflow-hidden">
            <div
              className="bg-linear-to-r from-accent to-green h-full transition-all duration-500"
              style={{ width: `${status.progress}%` }}
            />
          </div>
        </div>

        {/* Pipeline Steps */}
        <div className="space-y-3">
          {steps.map((step, index) => {
            let stepStatus: 'pending' | 'active' | 'done';
            if (index < currentStepIndex) {
              stepStatus = 'done';
            } else if (index === currentStepIndex && status.status === 'processing') {
              stepStatus = 'active';
            } else {
              stepStatus = 'pending';
            }

            return (
              <div
                key={step.name}
                className={`flex items-center gap-4 p-4 rounded transition ${
                  stepStatus === 'done'
                    ? 'bg-surface2 border border-green/30'
                    : stepStatus === 'active'
                    ? 'bg-accent/10 border border-accent pulse-slow'
                    : 'bg-surface border border-dim'
                }`}
              >
                <div className="text-2xl">{step.icon}</div>
                <div className="flex-1">
                  <p className="font-sans font-medium text-white">{step.name}</p>
                </div>
                <div className="text-lg">
                  {stepStatus === 'done' ? (
                    <span className="text-green">✓</span>
                  ) : stepStatus === 'active' ? (
                    <span className="inline-block animate-spin">⚙️</span>
                  ) : (
                    <span className="text-dim">◯</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Error State */}
        {status.status === 'error' && (
          <div className="mt-8 p-4 bg-red/10 border border-red rounded">
            <p className="text-red font-sans font-medium mb-2">Error during processing</p>
            <p className="text-sm text-muted mb-4">{status.message}</p>
            <div className="flex gap-2">
              <button
                onClick={handleRetry}
                disabled={retrying}
                className="px-4 py-2 bg-accent text-bg font-sans text-sm font-medium rounded hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {retrying ? 'Retrying…' : 'Retry Transcription'}
              </button>
              <button
                onClick={() => navigate('/history')}
                className="px-4 py-2 bg-surface text-white font-sans text-sm rounded hover:bg-surface2 transition"
              >
                View History
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
