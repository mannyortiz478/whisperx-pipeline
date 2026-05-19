import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { Speaker, Segment, ActionItem } from '../utils/api';
import { apiClient } from '../utils/api';

const SPEAKER_BG_CLASSES = ['bg-accent', 'bg-green', 'bg-purple', 'bg-amber', 'bg-red'] as const;

export const Transcript: React.FC = () => {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [actionItems, setActionItems] = useState<ActionItem[]>([]);
  const [search, setSearch] = useState('');
  const [editingSegmentId, setEditingSegmentId] = useState<string | null>(null);
  const [editingSegmentText, setEditingSegmentText] = useState('');
  const [renamingSpeakerId, setRenamingSpeakerId] = useState<string | null>(null);
  const [renamingSpeakerName, setRenamingSpeakerName] = useState('');
  const [segmentSaveStatus, setSegmentSaveStatus] = useState<Record<string, 'saving' | 'saved' | 'error'>>({});

  const { data: status, isLoading, isError } = useQuery({
    queryKey: ['status', jobId],
    queryFn: () => apiClient.getStatus(jobId!),
    select: (res) => res.data,
    enabled: !!jobId,
  });

  useEffect(() => {
    if (status?.result) {
      setSpeakers(status.result.speakers);
      setSegments(status.result.transcript);
      setActionItems(status.result.action_items);
    }
  }, [status]);

  const handleAudioTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const seekTo = (seconds: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = seconds;
    }
  };

  const handleSegmentEdit = (segmentId: string, currentText: string) => {
    setEditingSegmentId(segmentId);
    setEditingSegmentText(currentText);
  };

  const saveSegmentEdit = async (segmentId: string) => {
    if (!editingSegmentText.trim()) return;

    setSegmentSaveStatus((prev) => ({ ...prev, [segmentId]: 'saving' }));
    try {
      await apiClient.editSegment(jobId!, segmentId, editingSegmentText);
      setSegments((prev) =>
        prev.map((seg) =>
          seg.segment_id === segmentId ? { ...seg, text: editingSegmentText } : seg
        )
      );
      setSegmentSaveStatus((prev) => ({ ...prev, [segmentId]: 'saved' }));
      setTimeout(() => {
        setSegmentSaveStatus((prev) => {
          const { [segmentId]: _, ...rest } = prev;
          return rest;
        });
      }, 2000);
    } catch {
      setSegmentSaveStatus((prev) => ({ ...prev, [segmentId]: 'error' }));
    }
    setEditingSegmentId(null);
  };

  const saveSpeakerRename = async (speakerId: string) => {
    if (!renamingSpeakerName.trim()) return;

    try {
      const result = await apiClient.renameSpeaker(jobId!, speakerId, renamingSpeakerName);
      setSpeakers((prev) =>
        prev.map((sp) =>
          sp.speaker_id === speakerId ? result.data : sp
        )
      );
      setSegments((prev) =>
        prev.map((seg) =>
          seg.speaker_id === speakerId
            ? { ...seg, speaker: result.data.display_name }
            : seg
        )
      );
    } catch {
      alert('Failed to rename speaker');
    }
    setRenamingSpeakerId(null);
  };

  const filteredSegments = segments.filter((seg) =>
    seg.text.toLowerCase().includes(search.toLowerCase())
  );

  const currentSegment = segments.find(
    (seg) => seg.start <= currentTime && seg.end > currentTime
  );

  const handleDownload = async () => {
    try {
      const response = await apiClient.downloadTranscript(jobId!);
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `transcript_${jobId}.txt`);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
    } catch {
      alert('Failed to download transcript');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <p className="text-muted">Loading transcript...</p>
      </div>
    );
  }

  if (isError || !status?.result) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <button
          onClick={() => navigate('/')}
          className="text-accent hover:underline"
        >
          Back to upload
        </button>
      </div>
    );
  }

  const result = status.result;

  return (
    <div className="min-h-screen bg-bg">
      {/* Header */}
      <div className="bg-surface border-b border-subtle p-4 sm:p-8 sticky top-16 z-40">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-sans font-bold text-white mb-1">
                {result.job_id}
              </h1>
              <p className="text-sm text-muted">
                {result.segment_count} segments • {result.language} • {Math.floor(result.duration / 60)}:{String(Math.floor(result.duration % 60)).padStart(2, '0')}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleDownload}
                className="px-4 py-2 bg-accent text-bg font-sans text-sm font-medium rounded hover:opacity-90 transition"
              >
                Export
              </button>
              <button
                onClick={() => navigate('/history')}
                className="px-4 py-2 bg-surface2 text-white font-sans text-sm rounded hover:bg-surface transition"
              >
                Back
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Audio Player */}
      <div className="bg-surface2 p-4 sm:p-8 border-b border-subtle">
        <div className="max-w-6xl mx-auto">
          <audio
            ref={audioRef}
            src={`/audio/${jobId}`}
            onTimeUpdate={handleAudioTimeUpdate}
            controls
            className="w-full"
          />
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto p-4 sm:p-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Segments */}
        <div className="lg:col-span-2 space-y-4">
          {/* Search */}
          <div className="mb-6">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search segments..."
              className="w-full bg-surface2 border border-subtle text-white px-4 py-2 rounded font-sans focus:outline-none focus:border-accent transition"
            />
          </div>

          {/* Segment List */}
          {filteredSegments.map((segment) => {
            const speakerIdx = speakers.findIndex((s) => s.speaker_id === segment.speaker_id);
            const speakerBgClass = SPEAKER_BG_CLASSES[speakerIdx % SPEAKER_BG_CLASSES.length] ?? 'bg-dim';
            const isCurrentSegment = currentSegment?.segment_id === segment.segment_id;

            return (
              <div
                key={segment.segment_id}
                className={`p-4 rounded border transition ${
                  isCurrentSegment
                    ? `border-accent bg-accent/5`
                    : 'border-dim hover:border-accent'
                }`}
              >
                <div className="flex gap-3 items-start mb-2">
                  <button
                    onClick={() => seekTo(segment.start)}
                    className="font-mono text-accent hover:brightness-125 transition text-sm shrink-0 cursor-pointer"
                  >
                    [{segment.timestamp}]
                  </button>
                  <div
                    className={`px-2 py-1 rounded text-xs font-mono font-medium ${speakerBgClass} text-bg shrink-0`}
                  >
                    {segment.speaker}
                  </div>
                  {segmentSaveStatus[segment.segment_id] && (
                    <div className="text-xs ml-auto">
                      {segmentSaveStatus[segment.segment_id] === 'saving' && (
                        <span className="text-accent">💾</span>
                      )}
                      {segmentSaveStatus[segment.segment_id] === 'saved' && (
                        <span className="text-green">✓</span>
                      )}
                      {segmentSaveStatus[segment.segment_id] === 'error' && (
                        <span className="text-red">⚠</span>
                      )}
                    </div>
                  )}
                </div>
                {editingSegmentId === segment.segment_id ? (
                  <div className="space-y-2">
                    <textarea
                      value={editingSegmentText}
                      onChange={(e) => setEditingSegmentText(e.target.value)}
                      className="w-full bg-surface border border-accent text-white px-3 py-2 rounded font-sans focus:outline-none min-h-20"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => saveSegmentEdit(segment.segment_id)}
                        className="px-3 py-1 bg-green text-bg text-xs font-sans font-medium rounded hover:opacity-90 transition"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingSegmentId(null)}
                        className="px-3 py-1 bg-dim text-muted text-xs font-sans rounded hover:bg-surface transition"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <p
                    onClick={() => handleSegmentEdit(segment.segment_id, segment.text)}
                    className="text-white font-sans cursor-pointer hover:text-accent transition"
                  >
                    {search && (
                      <>
                        {segment.text.split(new RegExp(`(${search})`, 'gi')).map((part, i) =>
                          part.toLowerCase() === search.toLowerCase() ? (
                            <mark key={i} className="bg-accent bg-opacity-30">
                              {part}
                            </mark>
                          ) : (
                            <span key={i}>{part}</span>
                          )
                        )}
                      </>
                    )}
                    {!search && segment.text}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Speakers */}
          <div>
            <h2 className="text-lg font-sans font-semibold text-white mb-3">
              Speakers ({result.speaker_count})
            </h2>
            <div className="space-y-2">
              {speakers.map((speaker) => (
                <div
                  key={speaker.speaker_id}
                  className="p-2 bg-surface2 border border-subtle rounded flex items-center justify-between hover:border-accent transition"
                >
                  {renamingSpeakerId === speaker.speaker_id ? (
                    <div className="flex gap-2 flex-1">
                      <input
                        type="text"
                        value={renamingSpeakerName}
                        onChange={(e) => setRenamingSpeakerName(e.target.value)}
                        className="flex-1 bg-surface border border-accent px-2 py-1 rounded text-sm text-white font-sans focus:outline-none"
                        autoFocus
                      />
                      <button
                        onClick={() => saveSpeakerRename(speaker.speaker_id)}
                        className="px-2 py-1 bg-green text-bg text-xs rounded hover:opacity-90"
                      >
                        ✓
                      </button>
                    </div>
                  ) : (
                    <span
                      onClick={() => {
                        setRenamingSpeakerId(speaker.speaker_id);
                        setRenamingSpeakerName(speaker.display_name);
                      }}
                      className="text-sm font-sans text-white cursor-pointer hover:text-accent transition flex-1"
                    >
                      {speaker.display_name}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Action Items */}
          {actionItems.length > 0 && (
            <div>
              <h2 className="text-lg font-sans font-semibold text-white mb-3">
                Action Items ({actionItems.length})
              </h2>
              <div className="space-y-2">
                {actionItems.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 bg-surface2 border border-subtle rounded text-sm"
                  >
                    <div className="flex items-start gap-2 mb-1">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-mono font-medium text-white ${
                          item.priority === 'high'
                            ? 'bg-red/30'
                            : item.priority === 'medium'
                            ? 'bg-amber/30'
                            : 'bg-dim'
                        }`}
                      >
                        {item.priority}
                      </span>
                    </div>
                    <p className="font-sans text-white">{item.text}</p>
                    <p className="text-xs text-muted mt-1">
                      {item.assignee}
                      {item.timestamp && ` • ${item.timestamp}`}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
