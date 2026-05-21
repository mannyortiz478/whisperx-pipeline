import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { Speaker, Segment, ActionItem } from '../utils/api';
import { apiClient } from '../utils/api';
import { useAudioPlayer, RATES } from '../hooks/useAudioPlayer';
import { AudioPlayer } from '../components/AudioPlayer';

const SPEAKER_BG_CLASSES = ['bg-accent', 'bg-green', 'bg-purple', 'bg-amber', 'bg-red'] as const;

export const Transcript: React.FC = () => {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate  = useNavigate();
  const audioRef  = useRef<HTMLAudioElement>(null);

  // ── Local state ──────────────────────────────────────────────────────────────
  const [speakers,    setSpeakers]    = useState<Speaker[]>([]);
  const [segments,    setSegments]    = useState<Segment[]>([]);
  const [actionItems, setActionItems] = useState<ActionItem[]>([]);
  const [search,      setSearch]      = useState('');

  const [editingSegmentId,   setEditingSegmentId]   = useState<string | null>(null);
  const [editingSegmentText, setEditingSegmentText] = useState('');
  const [renamingSpeakerId,  setRenamingSpeakerId]  = useState<string | null>(null);
  const [renamingSpeakerName, setRenamingSpeakerName] = useState('');
  const [segmentSaveStatus, setSegmentSaveStatus] =
    useState<Record<string, 'saving' | 'saved' | 'error'>>({});

  const [docxGenerating,    setDocxGenerating]    = useState(false);
  const [pdfGenerating,     setPdfGenerating]     = useState(false);
  const [includeTimestamps, setIncludeTimestamps] = useState(true);

  // ── Audio player hook ────────────────────────────────────────────────────────
  const {
    currentTime, duration, isPlaying, playbackRate, volume, isMuted, activeSegmentId,
    togglePlay, seek, setPlaybackRate, toggleMute, setVolume,
  } = useAudioPlayer(audioRef, segments);

  // ── Scroll sync refs ─────────────────────────────────────────────────────────
  const segmentRefs      = useRef<Map<string, HTMLElement>>(new Map());
  const userScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRestoredRef = useRef(false);

  // Stable ref copies used in the keyboard handler to avoid re-registering it every frame.
  const currentTimeRef  = useRef(0);
  currentTimeRef.current = currentTime;
  const playbackRateRef  = useRef(1);
  playbackRateRef.current = playbackRate;

  // ── Status query ─────────────────────────────────────────────────────────────
  const { data: status, isLoading, isError } = useQuery({
    queryKey: ['status', jobId],
    queryFn:  () => apiClient.getStatus(jobId!),
    select:   (res) => res.data,
    enabled:  !!jobId,
  });

  useEffect(() => {
    if (status?.result) {
      setSpeakers(status.result.speakers);
      setSegments(status.result.transcript);
      setActionItems(status.result.action_items);
    }
  }, [status]);

  // ── Detect user-initiated scrolling (suppresses auto-scroll for 2 s) ─────────
  useEffect(() => {
    const onScroll = () => {
      userScrollingRef.current = true;
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = setTimeout(() => {
        userScrollingRef.current = false;
      }, 2000);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    };
  }, []);

  // ── Auto-scroll transcript to active segment ──────────────────────────────────
  useEffect(() => {
    if (!activeSegmentId || userScrollingRef.current) return;
    const el = segmentRefs.current.get(activeSegmentId);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [activeSegmentId]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────────
  // togglePlay, seek, setPlaybackRate are stable (useCallback) so this effect
  // only registers once; current values are read via refs to avoid stale closures.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) return;

      switch (e.key) {
        case ' ':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          seek(currentTimeRef.current - (e.shiftKey ? 30 : 5));
          break;
        case 'ArrowRight':
          e.preventDefault();
          seek(currentTimeRef.current + (e.shiftKey ? 30 : 5));
          break;
        case '[': {
          const idx = RATES.indexOf(playbackRateRef.current);
          if (idx > 0) setPlaybackRate(RATES[idx - 1]);
          break;
        }
        case ']': {
          const idx = RATES.indexOf(playbackRateRef.current);
          if (idx < RATES.length - 1) setPlaybackRate(RATES[idx + 1]);
          break;
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [togglePlay, seek, setPlaybackRate]);

  // ── Scroll position memory ───────────────────────────────────────────────────

  // Save on unmount so navigating back restores the position.
  useEffect(() => {
    return () => {
      sessionStorage.setItem(`transcript-scroll-${jobId}`, window.scrollY.toString());
    };
  }, [jobId]);

  // Restore once after segments first render.
  useEffect(() => {
    if (segments.length === 0 || scrollRestoredRef.current) return;
    scrollRestoredRef.current = true;
    const saved = sessionStorage.getItem(`transcript-scroll-${jobId}`);
    if (saved) {
      setTimeout(() => window.scrollTo({ top: parseInt(saved, 10) }), 100);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segments.length]);

  // ── Segment editing ───────────────────────────────────────────────────────────
  const handleSegmentEdit = (segmentId: string, currentText: string) => {
    setEditingSegmentId(segmentId);
    setEditingSegmentText(currentText);
  };

  const saveSegmentEdit = async (segmentId: string) => {
    if (!editingSegmentText.trim() || editingSegmentId !== segmentId) return;
    setEditingSegmentId(null); // clear immediately to prevent double-save on blur+click
    setSegmentSaveStatus((prev) => ({ ...prev, [segmentId]: 'saving' }));
    try {
      await apiClient.editSegment(jobId!, segmentId, editingSegmentText);
      setSegments((prev) =>
        prev.map((seg) =>
          seg.segment_id === segmentId ? { ...seg, text: editingSegmentText } : seg,
        ),
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
  };

  // ── Speaker renaming ──────────────────────────────────────────────────────────
  const saveSpeakerRename = async (speakerId: string) => {
    if (!renamingSpeakerName.trim()) return;
    try {
      const result = await apiClient.renameSpeaker(jobId!, speakerId, renamingSpeakerName);
      setSpeakers((prev) =>
        prev.map((sp) => (sp.speaker_id === speakerId ? result.data : sp)),
      );
      setSegments((prev) =>
        prev.map((seg) =>
          seg.speaker_id === speakerId
            ? { ...seg, speaker: result.data.display_name }
            : seg,
        ),
      );
    } catch {
      alert('Failed to rename speaker');
    }
    setRenamingSpeakerId(null);
  };

  // ── Export handlers ───────────────────────────────────────────────────────────
  const tsParam = includeTimestamps ? '' : '?include_timestamps=false';

  const handleDownload = () => {
    window.location.href = `/download/${jobId}/transcript.txt${tsParam}`;
  };

  const handleExportDocx = async () => {
    setDocxGenerating(true);
    try {
      const res  = await fetch(`/jobs/${jobId}/export/docx${tsParam}`);
      if (!res.ok) throw new Error('Failed');
      const blob = await res.blob();
      const url  = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `transcript_${jobId}.docx`);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch {
      alert('Failed to generate DOCX');
    } finally {
      setDocxGenerating(false);
    }
  };

  const handleExportPdf = async () => {
    setPdfGenerating(true);
    try {
      const res  = await fetch(`/jobs/${jobId}/export/pdf${tsParam}`);
      if (!res.ok) throw new Error('Failed');
      const blob = await res.blob();
      const url  = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `transcript_${jobId}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch {
      alert('Failed to generate PDF');
    } finally {
      setPdfGenerating(false);
    }
  };

  // ── Derived values ────────────────────────────────────────────────────────────
  const filteredSegments = segments.filter((seg) =>
    seg.text.toLowerCase().includes(search.toLowerCase()),
  );

  // ── Loading / error states ────────────────────────────────────────────────────
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
        <button onClick={() => navigate('/')} className="text-accent hover:underline">
          Back to upload
        </button>
      </div>
    );
  }

  const result = status.result;

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-bg">

      {/* ── Sticky bar: page header + custom audio player ─────────────────── */}
      <div className="sticky top-16 z-40">

        {/* Page header */}
        <div className="bg-surface border-b border-subtle p-4 sm:p-6">
          <div className="max-w-6xl mx-auto">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-2xl sm:text-3xl font-sans font-bold text-white mb-1">
                  {result.job_id}
                </h1>
                <p className="text-sm text-muted">
                  {result.segment_count} segments • {result.language} •{' '}
                  {Math.floor(result.duration / 60)}:{String(Math.floor(result.duration % 60)).padStart(2, '0')}
                </p>
              </div>
              <div className="flex gap-2 items-center flex-wrap">
                {/* Export panel */}
                <div className="flex flex-col gap-1.5 p-2.5 bg-surface2 border border-subtle rounded">
                  {/* Timestamp toggle */}
                  <button
                    data-testid="timestamps-toggle"
                    onClick={() => setIncludeTimestamps((v) => !v)}
                    className="flex items-center gap-2 group"
                    aria-label="Toggle timestamps"
                  >
                    <div
                      className={`relative w-7 h-3.5 rounded-full transition-colors duration-200 ease-in-out ${
                        includeTimestamps ? 'bg-accent' : 'bg-dim'
                      }`}
                    >
                      <div
                        className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white shadow transition-all duration-200 ease-in-out ${
                          includeTimestamps ? 'left-3.5' : 'left-0.5'
                        }`}
                      />
                    </div>
                    <span className="font-mono text-[11px] text-muted group-hover:text-white transition-colors">
                      Include timestamps
                    </span>
                  </button>
                  {/* Export buttons */}
                  <div className="flex gap-1">
                    <button
                      data-testid="export-txt"
                      onClick={handleDownload}
                      className="px-2.5 py-1 bg-surface border border-subtle text-white font-mono text-xs rounded hover:border-accent hover:bg-accent/10 transition"
                    >
                      ↓ TXT
                    </button>
                    <button
                      data-testid="export-docx"
                      onClick={handleExportDocx}
                      disabled={docxGenerating}
                      className="px-2.5 py-1 bg-surface border border-subtle text-white font-mono text-xs rounded hover:border-accent hover:bg-accent/10 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {docxGenerating ? 'Generating…' : '↓ DOCX'}
                    </button>
                    <button
                      data-testid="export-pdf"
                      onClick={handleExportPdf}
                      disabled={pdfGenerating}
                      className="px-2.5 py-1 bg-surface border border-subtle text-white font-mono text-xs rounded hover:border-accent hover:bg-accent/10 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {pdfGenerating ? 'Generating…' : '↓ PDF'}
                    </button>
                  </div>
                </div>
                <button
                  onClick={() => navigate('/history')}
                  className="px-4 py-2 bg-surface2 text-white font-sans text-sm rounded hover:bg-surface transition self-end"
                >
                  Back
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Custom audio player */}
        <div className="max-w-full">
          <AudioPlayer
            jobId={jobId!}
            currentTime={currentTime}
            duration={duration}
            isPlaying={isPlaying}
            playbackRate={playbackRate}
            volume={volume}
            isMuted={isMuted}
            onTogglePlay={togglePlay}
            onSeek={seek}
            onSetPlaybackRate={setPlaybackRate}
            onToggleMute={toggleMute}
            onSetVolume={setVolume}
          />
        </div>

        {/* Hidden audio element — the AudioPlayer controls this via the ref */}
        <audio ref={audioRef} src={`/audio/${jobId}`} preload="metadata" style={{ display: 'none' }} />
      </div>

      {/* ── Main content ──────────────────────────────────────────────────── */}
      <div className="max-w-6xl mx-auto p-4 sm:p-8 grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* ── Segment list ────────────────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-2">

          {/* Search */}
          <div className="mb-6">
            <input
              data-testid="search-input"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search segments..."
              className="w-full bg-surface2 border border-subtle text-white px-4 py-2 rounded font-sans focus:outline-none focus:border-accent transition"
            />
          </div>

          {filteredSegments.map((segment) => {
            const speakerIdx   = speakers.findIndex((s) => s.speaker_id === segment.speaker_id);
            const speakerBgClass = SPEAKER_BG_CLASSES[speakerIdx % SPEAKER_BG_CLASSES.length] ?? 'bg-dim';

            const isActive = activeSegmentId === segment.segment_id;
            const isPassed = !isActive && segment.end < currentTime;

            return (
              <div
                key={segment.segment_id}
                ref={(el) => {
                  if (el) segmentRefs.current.set(segment.segment_id, el);
                  else segmentRefs.current.delete(segment.segment_id);
                }}
                data-highlighted={search.length > 0 ? 'true' : undefined}
                className={`p-4 rounded border transition-[background-color,border-color] duration-150 ${
                  isActive
                    ? 'border-accent bg-[rgba(99,179,237,0.08)]'
                    : isPassed
                    ? 'border-dim/50'
                    : 'border-dim hover:border-accent'
                }`}
                style={isActive ? { borderLeftWidth: '3px' } : undefined}
              >
                <div className="flex gap-3 items-start mb-2">

                  {/* Timestamp — click seeks, hover shows play icon */}
                  <button
                    onClick={() => seek(segment.start)}
                    className="group flex items-center gap-1 font-mono text-accent hover:text-white transition text-sm shrink-0"
                    title={`Seek to ${segment.timestamp}`}
                  >
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity text-xs">▶</span>
                    <span>[{segment.timestamp}]</span>
                  </button>

                  {/* Speaker chip */}
                  <div
                    data-testid="segment-speaker"
                    className={`px-2 py-1 rounded text-xs font-mono font-medium shrink-0 transition-opacity ${speakerBgClass} text-bg ${
                      isActive ? 'opacity-100' : 'opacity-80'
                    }`}
                  >
                    {segment.speaker}
                  </div>

                  {/* Save status indicator */}
                  {segmentSaveStatus[segment.segment_id] && (
                    <div
                      data-testid="save-indicator"
                      data-status={segmentSaveStatus[segment.segment_id]}
                      className="text-xs ml-auto"
                    >
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

                {/* Segment text / edit area */}
                {editingSegmentId === segment.segment_id ? (
                  <div className="space-y-2">
                    <textarea
                      value={editingSegmentText}
                      onChange={(e) => setEditingSegmentText(e.target.value)}
                      onBlur={() => saveSegmentEdit(segment.segment_id)}
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
                    data-testid="segment-text"
                    onClick={() => handleSegmentEdit(segment.segment_id, segment.text)}
                    className={`font-sans cursor-pointer hover:text-accent transition-colors ${
                      isPassed ? 'text-muted' : 'text-white'
                    }`}
                  >
                    {search ? (
                      segment.text.split(new RegExp(`(${search})`, 'gi')).map((part, i) =>
                        part.toLowerCase() === search.toLowerCase() ? (
                          <mark key={i} className="bg-accent bg-opacity-30 text-white">
                            {part}
                          </mark>
                        ) : (
                          <span key={i}>{part}</span>
                        ),
                      )
                    ) : (
                      segment.text
                    )}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {/* ── Sidebar ─────────────────────────────────────────────────────── */}
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
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveSpeakerRename(speaker.speaker_id);
                          if (e.key === 'Escape') setRenamingSpeakerId(null);
                        }}
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
                      data-testid="speaker-label"
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
                    <div className="flex items-start gap-2 mb-1 flex-wrap">
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
                      {item.due_date && (
                        <span className="px-2 py-0.5 rounded text-xs font-mono font-medium text-amber bg-amber/20">
                          due: {item.due_date}
                        </span>
                      )}
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
