import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../utils/api';

export const History: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: jobs, isLoading, isError } = useQuery({
    queryKey: ['jobs'],
    queryFn: () => apiClient.getJobs(),
    select: (res) => res.data.jobs,
  });

  const handleDelete = async (jobId: string) => {
    if (!window.confirm('Delete this transcription? This cannot be undone.')) return;

    setDeletingId(jobId);
    try {
      await apiClient.deleteJob(jobId);
      queryClient.setQueryData(['jobs'], (prev: any) => ({
        ...prev,
        data: {
          ...prev.data,
          jobs: prev.data.jobs.filter((job: any) => job.job_id !== jobId),
        },
      }));
    } catch {
      alert('Failed to delete job');
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green/10 border-green text-green';
      case 'processing':
        return 'bg-amber/10 border-amber text-amber pulse-slow';
      case 'failed':
        return 'bg-red/10 border-red text-red';
      default:
        return 'bg-dim/10 border-dim text-dim';
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-bg p-4 sm:p-8 flex items-center justify-center">
        <p className="text-muted">Loading history...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="min-h-screen bg-bg p-4 sm:p-8 flex items-center justify-center">
        <p className="text-red">Failed to load history</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg p-4 sm:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl sm:text-4xl font-sans font-bold text-white mb-2">
            Transcription History
          </h1>
          <p className="text-muted text-sm sm:text-base">
            {jobs?.length || 0} transcriptions
          </p>
        </div>

        {!jobs || jobs.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-5xl mb-4">📭</div>
            <p className="text-white font-sans text-lg mb-2">No transcriptions yet</p>
            <p className="text-muted text-sm mb-6">Start by uploading an audio file</p>
            <button
              onClick={() => navigate('/')}
              className="px-4 py-2 bg-accent text-bg font-sans font-medium rounded hover:opacity-90 transition"
            >
              Upload Audio
            </button>
          </div>
        ) : (
          <div className="space-y-2 overflow-x-auto">
            {/* Table Header */}
            <div className="hidden sm:grid sm:grid-cols-12 gap-4 p-4 bg-surface2 border border-subtle rounded-t font-mono text-xs text-muted">
              <div className="col-span-3">File</div>
              <div className="col-span-2">Date</div>
              <div className="col-span-1">Duration</div>
              <div className="col-span-1">Model</div>
              <div className="col-span-1">Language</div>
              <div className="col-span-2">Status</div>
              <div className="col-span-2">Actions</div>
            </div>

            {/* Table Rows */}
            {jobs.map((job, idx) => (
              <div
                key={job.job_id}
                className={`p-4 border border-subtle rounded hover:border-accent transition cursor-pointer ${
                  idx % 2 === 0 ? 'bg-surface' : 'bg-surface2'
                }`}
                onClick={() => {
                  if (job.status === 'completed') {
                    navigate(`/jobs/${job.job_id}/transcript`);
                  }
                }}
              >
                {/* Mobile View */}
                <div className="sm:hidden space-y-2 text-sm">
                  <div>
                    <p className="text-muted font-mono text-xs">File</p>
                    <p className="text-white font-sans truncate">{job.filename}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-muted font-mono text-xs">Date</p>
                      <p className="text-white text-xs">{formatDate(job.created_at)}</p>
                    </div>
                    <div>
                      <p className="text-muted font-mono text-xs">Duration</p>
                      <p className="text-white text-xs">{formatDuration(job.duration)}</p>
                    </div>
                    <div>
                      <p className="text-muted font-mono text-xs">Model</p>
                      <p className="text-white text-xs">{job.transcription_model}</p>
                    </div>
                    <div>
                      <p className="text-muted font-mono text-xs">Language</p>
                      <p className="text-white text-xs">{job.language || 'unknown'}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-dim">
                    <span
                      className={`px-2 py-1 rounded text-xs font-mono font-medium border ${getStatusColor(
                        job.status
                      )}`}
                    >
                      {job.status}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(job.job_id);
                      }}
                      disabled={deletingId === job.job_id}
                      className="text-red hover:text-red opacity-60 hover:opacity-100 transition text-xs"
                    >
                      {deletingId === job.job_id ? '...' : '🗑'}
                    </button>
                  </div>
                </div>

                {/* Desktop View */}
                <div className="hidden sm:grid sm:grid-cols-12 gap-4 items-center">
                  <div className="col-span-3">
                    <p className="text-white font-sans text-sm truncate">{job.filename}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-muted text-xs">{formatDate(job.created_at)}</p>
                  </div>
                  <div className="col-span-1">
                    <p className="text-white font-mono text-sm">{formatDuration(job.duration)}</p>
                  </div>
                  <div className="col-span-1">
                    <p className="text-muted text-xs">{job.transcription_model}</p>
                  </div>
                  <div className="col-span-1">
                    <p className="text-muted text-xs">{job.language || 'unknown'}</p>
                  </div>
                  <div className="col-span-2">
                    <span
                      className={`px-2 py-1 rounded text-xs font-mono font-medium border inline-block ${getStatusColor(
                        job.status
                      )}`}
                    >
                      {job.status}
                    </span>
                  </div>
                  <div className="col-span-2 flex gap-2 justify-end">
                    {job.status === 'completed' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/jobs/${job.job_id}/transcript`);
                        }}
                        className="text-accent hover:text-white transition text-xs"
                      >
                        View
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(job.job_id);
                      }}
                      disabled={deletingId === job.job_id}
                      className="text-red hover:text-red opacity-60 hover:opacity-100 transition text-xs disabled:opacity-50"
                    >
                      {deletingId === job.job_id ? '...' : 'Delete'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
