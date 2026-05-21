import { useRef, useState, useEffect, useCallback } from 'react';
import type { RefObject } from 'react';
import type { Segment } from '../utils/api';

export const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];

function findActiveSegmentId(segments: Segment[], time: number): string | null {
  return segments.find((s) => s.start <= time && s.end > time)?.segment_id ?? null;
}

export function useAudioPlayer(
  audioRef: RefObject<HTMLAudioElement | null>,
  segments: Segment[],
) {
  const [currentTime, setCurrentTime]       = useState(0);
  const [duration, setDuration]             = useState(0);
  const [isPlaying, setIsPlaying]           = useState(false);
  const [playbackRate, setPlaybackRateState] = useState(1);
  const [volume, setVolumeState]            = useState(1);
  const [isMuted, setIsMuted]               = useState(false);
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null);

  const rafRef = useRef<number | null>(null);

  // Always hold the latest segments without making them a dep of the RAF loop.
  // Assigning to .current during render is safe — it's synchronous before paint.
  const segmentsRef = useRef(segments);
  segmentsRef.current = segments;

  // RAF loop — reads audio position at 60 fps and reschedules itself while playing.
  const runRaf = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    const t = el.currentTime;
    setCurrentTime(t);
    setActiveSegmentId(findActiveSegmentId(segmentsRef.current, t));
    if (!el.paused) {
      rafRef.current = requestAnimationFrame(runRaf);
    }
  }, [audioRef]); // segmentsRef accessed by ref — stable dep

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;

    const onPlay = () => {
      setIsPlaying(true);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(runRaf);
    };

    const onPause = () => {
      setIsPlaying(false);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      // Sync once more so the UI reflects the exact pause position.
      setCurrentTime(el.currentTime);
    };

    const onDurationChange = () => {
      setDuration(isNaN(el.duration) ? 0 : el.duration);
    };

    const onEnded = () => {
      setIsPlaying(false);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };

    const onRateChange   = () => setPlaybackRateState(el.playbackRate);
    const onVolumeChange = () => { setVolumeState(el.volume); setIsMuted(el.muted); };

    el.addEventListener('play',           onPlay);
    el.addEventListener('pause',          onPause);
    el.addEventListener('durationchange', onDurationChange);
    el.addEventListener('ended',          onEnded);
    el.addEventListener('ratechange',     onRateChange);
    el.addEventListener('volumechange',   onVolumeChange);

    return () => {
      el.removeEventListener('play',           onPlay);
      el.removeEventListener('pause',          onPause);
      el.removeEventListener('durationchange', onDurationChange);
      el.removeEventListener('ended',          onEnded);
      el.removeEventListener('ratechange',     onRateChange);
      el.removeEventListener('volumechange',   onVolumeChange);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [audioRef, runRaf]);

  // ─── Controls ──────────────────────────────────────────────────────────────

  const seek = useCallback((seconds: number) => {
    const el = audioRef.current;
    if (!el) return;
    const dur     = isNaN(el.duration) ? 0 : el.duration;
    const clamped = Math.max(0, Math.min(seconds, dur));
    el.currentTime = clamped;
    setCurrentTime(clamped);
    setActiveSegmentId(findActiveSegmentId(segmentsRef.current, clamped));
  }, [audioRef]);

  const togglePlay = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    el.paused ? el.play() : el.pause();
  }, [audioRef]);

  const setPlaybackRate = useCallback((rate: number) => {
    if (audioRef.current) audioRef.current.playbackRate = rate;
    setPlaybackRateState(rate);
  }, [audioRef]);

  const toggleMute = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    el.muted = !el.muted;
    setIsMuted(el.muted);
  }, [audioRef]);

  const setVolume = useCallback((level: number) => {
    const el = audioRef.current;
    if (!el) return;
    el.volume  = level;
    el.muted   = level === 0;
    setVolumeState(level);
    setIsMuted(level === 0);
  }, [audioRef]);

  return {
    currentTime,
    duration,
    isPlaying,
    playbackRate,
    volume,
    isMuted,
    activeSegmentId,
    togglePlay,
    seek,
    setPlaybackRate,
    toggleMute,
    setVolume,
  };
}
