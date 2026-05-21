import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../utils/api';

export const History: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [deletingId,       setDeletingId]       = useState<string | null>(null);
  const [generatingExport, setGeneratingExport] = useState<Record<string, 'docx' | 'pdf'>>({});
  const [retryingId,       setRetryingId]       = useState<string | null>(null);
  const [retryErrors,      setRetryErrors]      = useState<Record<string, string>>({});
  // Per-row timestamp preference: true = include (default), false = exclude
  const [noTimestamps, setNoTimestamps] = useState<Set<string>>(new Set());

  // Holds active polling interval IDs so we can clear them on unmount.
  const pollingRefs = useRef<Record<string, ReturnType<typeof setInterval>>>({});

  useEffect(() => {
    return () => {
      Object.values(pollingRefs.current).forEach(clearInterval);
    };
  }, []);

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

  const handleRetry = async (e: React.MouseEvent, jobId: string) => {
    e.stopPropagation();
    setRetryingId(jobId);
    setRetryErrors((prev) => { const next = { ...prev }; delete next[jobId]; return next; });

    try {
      await apiClient.retryJob(jobId);
      setRetryingId(null);

      // Optimistic update
      queryClient.setQueryData(['jobs'], (prev: any) => ({
        ...prev,
        data: {
          ...prev.data,
          jobs: prev.data.jobs.map((j: any) =>
            j.job_id === jobId ? { ...j, status: 'queued' } : j,
          ),
        },
      }));

      // Poll until completed/failed, then refresh the row
      pollingRefs.current[jobId] = setInterval(async () => {
        try {
          const res = await apiClient.getStatus(jobId);
          const s = res.data.status;
          if (s === 'done' || s === 'error') {
            clearInterval(pollingRefs.current[jobId]);
            delete pollingRefs.current[jobId];
            queryClient.invalidateQueries({ queryKey: ['jobs'] });
          } else {
            // Keep the row status in sync while processing
            const mapped = s === 'processing' ? 'processing' : 'queued';
            queryClient.setQueryData(['jobs'], (prev: any) => ({
              ...prev,
              data: {
                ...prev.data,
                jobs: prev.data.jobs.map((j: any) =>
                  j.job_id === jobId ? { ...j, status: mapped } : j,
                ),
              },
            }));
          }
        } catch {
          clearInterval(pollingRefs.current[jobId]);
          delete pollingRefs.current[jobId];
        }
      }, 2000);

    } catch (err: any) {
      const msg = err.response?.data?.error || 'Retry failed';
      setRetryErrors((prev) => ({ ...prev, [jobId]: msg }));
      setRetryingId(null);
    }
  };

  const toggleTimestamps = (e: React.MouseEvent, jobId: string) => {
    e.stopPropagation();
    setNoTimestamps((prev) => {
      const next = new Set(prev);
      if (next.has(jobId)) next.delete(jobId); else next.add(jobId);
      return next;
    });
  };

  const handleExport = async (e: React.MouseEvent, jobId: string, fmt: 'txt' | 'docx' | 'pdf') => {
    e.stopPropagation();
    const withTs = !noTimestamps.has(jobId);
    const tsParam = withTs ? '' : '?include_timestamps=false';

    if (fmt === 'txt') {
      const link = document.createElement('a');
      link.href = `/download/${jobId}/transcript.txt${tsParam}`;
      link.setAttribute('download', `transcript_${jobId}.txt`);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      return;
    }
    setGeneratingExport((prev) => ({ ...prev, [jobId]: fmt }));
    try {
      const res = await fetch(`/jobs/${jobId}/export/${fmt}${tsParam}`);
      if (!res.ok) throw new Error('Failed');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `transcript_${jobId}.${fmt}`);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch {
      alert(`Failed to generate ${fmt.toUpperCase()}`);
    } finally {
      setGeneratingExport((prev) => {
        const next = { ...prev };
        delete next[jobId];
        return next;
      });
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
              <div className="col-span-1">Status</div>
              <div className="col-span-3">Actions</div>
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
                    <div className="flex gap-2 items-center flex-wrap">
                      {job.status === 'completed' && (
                        <>
                          {/* Compact timestamp toggle */}
                          <button
                            onClick={(e) => toggleTimestamps(e, job.job_id)}
                            title={noTimestamps.has(job.job_id) ? 'Timestamps off' : 'Timestamps on'}
                            className={`font-mono text-[10px] px-1.5 py-0.5 rounded border transition ${
                              noTimestamps.has(job.job_id)
                                ? 'bg-surface2 text-muted border-dim'
                                : 'bg-accent/20 text-accent border-accent/50'
                            }`}
                          >
                            ts
                          </button>
                          <button
                            onClick={(e) => handleExport(e, job.job_id, 'txt')}
                            className="text-muted hover:text-accent transition font-mono text-xs"
                          >
                            ↓txt
                          </button>
                          <button
                            onClick={(e) => handleExport(e, job.job_id, 'docx')}
                            disabled={generatingExport[job.job_id] === 'docx'}
                            className="text-muted hover:text-accent transition font-mono text-xs disabled:opacity-40"
                          >
                            {generatingExport[job.job_id] === 'docx' ? '…' : '↓docx'}
                          </button>
                          <button
                            onClick={(e) => handleExport(e, job.job_id, 'pdf')}
                            disabled={generatingExport[job.job_id] === 'pdf'}
                            className="text-muted hover:text-accent transition font-mono text-xs disabled:opacity-40"
                          >
                            {generatingExport[job.job_id] === 'pdf' ? '…' : '↓pdf'}
                          </button>
                        </>
                      )}
                      {job.status === 'failed' && (
                        <>
                          {retryErrors[job.job_id] && (
                            <span className="text-red font-mono text-[10px]">
                              {retryErrors[job.job_id]}
                            </span>
                          )}
                          <button
                            onClick={(e) => handleRetry(e, job.job_id)}
                            disabled={retryingId === job.job_id}
                            className="text-accent hover:text-white transition font-mono text-xs disabled:opacity-50"
                          >
                            {retryingId === job.job_id ? '…' : 'Retry'}
                          </button>
                        </>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(job.job_id);
                        }}
                        disabled={deletingId === job.job_id}
                        className="text-red opacity-60 hover:opacity-100 transition text-xs"
                      >
                        {deletingId === job.job_id ? '...' : '🗑'}
                      </button>
                    </div>
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
                  <div className="col-span-1">
                    <span
                      className={`px-2 py-1 rounded text-xs font-mono font-medium border inline-block ${getStatusColor(
                        job.status
                      )}`}
                    >
                      {job.status}
                    </span>
                  </div>
                  <div className="col-span-3 flex gap-2 items-center flex-wrap">
                    {job.status === 'completed' && (
                      <>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/jobs/${job.job_id}/transcript`);
                          }}
                          className="text-accent hover:text-white transition font-mono text-xs"
                        >
                          View
                        </button>
                        {/* Compact timestamp toggle */}
                        <button
                          onClick={(e) => toggleTimestamps(e, job.job_id)}
                          title={noTimestamps.has(job.job_id) ? 'Timestamps off — click to enable' : 'Timestamps on — click to disable'}
                          className={`font-mono text-[10px] px-1.5 py-0.5 rounded border transition ${
                            noTimestamps.has(job.job_id)
                              ? 'bg-surface2 text-muted border-dim'
                              : 'bg-accent/20 text-accent border-accent/50'
                          }`}
                        >
                          ts
                        </button>
                        <button
                          onClick={(e) => handleExport(e, job.job_id, 'txt')}
                          className="text-muted hover:text-accent transition font-mono text-xs"
                          title="Download TXT"
                        >
                          ↓txt
                        </button>
                        <button
                          onClick={(e) => handleExport(e, job.job_id, 'docx')}
                          disabled={generatingExport[job.job_id] === 'docx'}
                          className="text-muted hover:text-accent transition font-mono text-xs disabled:opacity-40"
                          title="Download DOCX"
                        >
                          {generatingExport[job.job_id] === 'docx' ? '…' : '↓docx'}
                        </button>
                        <button
                          onClick={(e) => handleExport(e, job.job_id, 'pdf')}
                          disabled={generatingExport[job.job_id] === 'pdf'}
                          className="text-muted hover:text-accent transition font-mono text-xs disabled:opacity-40"
                          title="Download PDF"
                        >
                          {generatingExport[job.job_id] === 'pdf' ? '…' : '↓pdf'}
                        </button>
                      </>
                    )}
                    {job.status === 'failed' && (
                      <>
                        {retryErrors[job.job_id] && (
                          <span className="text-red font-mono text-[10px]">
                            {retryErrors[job.job_id]}
                          </span>
                        )}
                        <button
                          onClick={(e) => handleRetry(e, job.job_id)}
                          disabled={retryingId === job.job_id}
                          className="text-accent hover:text-white transition font-mono text-xs disabled:opacity-50"
                        >
                          {retryingId === job.job_id ? '…' : 'Retry'}
                        </button>
                      </>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(job.job_id);
                      }}
                      disabled={deletingId === job.job_id}
                      className="text-red opacity-60 hover:opacity-100 transition font-mono text-xs disabled:opacity-50 ml-auto"
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
