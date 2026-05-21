import React, { useEffect, useRef, useState, useCallback } from 'react';
import { RATES } from '../hooks/useAudioPlayer';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ─── Waveform canvas ──────────────────────────────────────────────────────────

interface WaveformProps {
  data: Float32Array;
  currentTime: number;
  duration: number;
  onSeek: (s: number) => void;
  onHover: (pct: number | null, time: number | null) => void;
}

const WaveformCanvas: React.FC<WaveformProps> = ({ data, currentTime, duration, onSeek, onHover }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);

    let maxAmp = 0;
    for (let i = 0; i < data.length; i++) {
      if (data[i] > maxAmp) maxAmp = data[i];
    }
    if (maxAmp === 0) return;

    const progress  = duration > 0 ? currentTime / duration : 0;
    const playedIdx = Math.floor(progress * data.length);
    const barW      = width / data.length;

    for (let i = 0; i < data.length; i++) {
      const normalized = data[i] / maxAmp;
      const barH = Math.max(2, normalized * height * 0.85);
      const x    = i * barW;
      const y    = (height - barH) / 2;
      ctx.fillStyle = i < playedIdx ? '#63b3ed' : 'rgba(255,255,255,0.12)';
      ctx.fillRect(x + 0.5, y, Math.max(1, barW - 1), barH);
    }

    // Playhead line
    const lineX = Math.floor(progress * width);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(lineX, 0, 1, height);
  }, [data, currentTime, duration]);

  const pctFromEvent = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  };

  return (
    <canvas
      ref={canvasRef}
      width={800}
      height={48}
      onClick={(e) => { e.stopPropagation(); onSeek(pctFromEvent(e) * duration); }}
      onMouseMove={(e) => { const p = pctFromEvent(e); onHover(p, p * duration); }}
      onMouseLeave={() => onHover(null, null)}
      className="w-full h-12 cursor-pointer rounded"
    />
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

export interface AudioPlayerProps {
  jobId: string;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  playbackRate: number;
  volume: number;
  isMuted: boolean;
  onTogglePlay: () => void;
  onSeek: (s: number) => void;
  onSetPlaybackRate: (r: number) => void;
  onToggleMute: () => void;
  onSetVolume: (v: number) => void;
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({
  jobId,
  currentTime,
  duration,
  isPlaying,
  playbackRate,
  volume,
  isMuted,
  onTogglePlay,
  onSeek,
  onSetPlaybackRate,
  onToggleMute,
  onSetVolume,
}) => {
  const [waveformData, setWaveformData]   = useState<Float32Array | null>(null);
  const [waveformFailed, setWaveformFailed] = useState(false);
  const [hoverInfo, setHoverInfo]         = useState<{ pct: number; time: number } | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const shortcutsWrapRef = useRef<HTMLDivElement>(null);

  // ── Waveform loader ──────────────────────────────────────────────────────────
  // Fetches audio, decodes via Web Audio API, downsamples to 800 points.
  // Falls back silently if fetch + decode takes > 3 s or throws.
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const timeoutId = setTimeout(() => {
      controller.abort();
      if (!cancelled) setWaveformFailed(true);
    }, 3000);

    (async () => {
      try {
        const res = await fetch(`/audio/${jobId}`, { signal: controller.signal });
        if (!res.ok) throw new Error('non-ok');
        const buf = await res.arrayBuffer();
        if (cancelled) return;

        clearTimeout(timeoutId);

        const audioCtx = new AudioContext();
        const decoded  = await audioCtx.decodeAudioData(buf);
        await audioCtx.close();
        if (cancelled) return;

        const ch        = decoded.getChannelData(0);
        const N         = 800;
        const blockSize = Math.floor(ch.length / N);
        const out       = new Float32Array(N);
        for (let i = 0; i < N; i++) {
          let sum = 0;
          for (let j = 0; j < blockSize; j++) sum += Math.abs(ch[i * blockSize + j] ?? 0);
          out[i] = sum / blockSize;
        }
        setWaveformData(out);
      } catch {
        if (!cancelled) setWaveformFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [jobId]);

  // ── Click-outside for shortcuts popup ────────────────────────────────────────
  useEffect(() => {
    if (!showShortcuts) return;
    const handler = (e: MouseEvent) => {
      if (shortcutsWrapRef.current && !shortcutsWrapRef.current.contains(e.target as Node)) {
        setShowShortcuts(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showShortcuts]);

  // ── Derived values ───────────────────────────────────────────────────────────
  const progress  = duration > 0 ? (currentTime / duration) * 100 : 0;
  const volDisplay = isMuted ? 0 : volume;
  const volPct    = volDisplay * 100;
  const hasWaveform = waveformData !== null && !waveformFailed;

  const handleSeekBarMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (duration <= 0 || hasWaveform) return; // waveform handles its own hover
      const rect = e.currentTarget.getBoundingClientRect();
      const pct  = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      setHoverInfo({ pct, time: pct * duration });
    },
    [duration, hasWaveform],
  );

  const handleSeekBarClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (duration <= 0 || hasWaveform) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const pct  = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      onSeek(pct * duration);
    },
    [duration, hasWaveform, onSeek],
  );

  // Shared thumb classes for both seek and volume sliders
  const thumbCls = [
    '[&::-webkit-slider-thumb]:appearance-none',
    '[&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3',
    '[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent',
    '[&::-webkit-slider-thumb]:cursor-pointer',
    '[&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:h-3',
    '[&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-accent',
    '[&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer',
  ].join(' ');

  return (
    <div className="bg-surface2 border-b border-subtle px-4 py-3 space-y-2.5">

      {/* ── Row 1: transport + seek + time ─────────────────────────────────── */}
      <div className="flex items-center gap-3">

        {/* Skip back 10 s */}
        <button
          onClick={() => onSeek(currentTime - 10)}
          className="font-mono text-xs text-muted hover:text-white transition flex-shrink-0 select-none"
          title="Back 10 s"
        >
          ⏮10
        </button>

        {/* Play / Pause */}
        <button
          onClick={onTogglePlay}
          className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition select-none ${
            isPlaying
              ? 'bg-accent text-bg hover:opacity-90'
              : 'bg-surface border border-subtle text-white hover:border-accent'
          }`}
          title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
        >
          <span className="text-sm">{isPlaying ? '⏸' : '▶'}</span>
        </button>

        {/* Skip forward 10 s */}
        <button
          onClick={() => onSeek(currentTime + 10)}
          className="font-mono text-xs text-muted hover:text-white transition flex-shrink-0 select-none"
          title="Forward 10 s"
        >
          10⏭
        </button>

        {/* Seek area */}
        <div
          className="flex-1 relative"
          onMouseMove={handleSeekBarMouseMove}
          onMouseLeave={() => { if (!hasWaveform) setHoverInfo(null); }}
          onClick={handleSeekBarClick}
        >
          {/* Hover tooltip */}
          {hoverInfo !== null && (
            <div
              className="absolute -top-7 px-1.5 py-0.5 bg-surface border border-subtle rounded text-xs font-mono text-white pointer-events-none z-10 -translate-x-1/2 whitespace-nowrap"
              style={{ left: `${hoverInfo.pct * 100}%` }}
            >
              {fmtTime(hoverInfo.time)}
            </div>
          )}

          {hasWaveform ? (
            <WaveformCanvas
              data={waveformData!}
              currentTime={currentTime}
              duration={duration}
              onSeek={onSeek}
              onHover={(pct, time) =>
                pct !== null && time !== null
                  ? setHoverInfo({ pct, time })
                  : setHoverInfo(null)
              }
            />
          ) : (
            <input
              type="range"
              min={0}
              max={duration || 0}
              step={0.1}
              value={currentTime}
              onChange={(e) => onSeek(parseFloat(e.target.value))}
              style={{
                background: `linear-gradient(to right, #63b3ed ${progress}%, rgba(255,255,255,0.08) ${progress}%)`,
              }}
              className={`w-full h-1.5 rounded-full appearance-none cursor-pointer ${thumbCls}`}
            />
          )}
        </div>

        {/* Time display */}
        <span className="font-mono text-xs text-muted whitespace-nowrap flex-shrink-0">
          {fmtTime(currentTime)} / {fmtTime(duration)}
        </span>

        {/* Shortcuts toggle */}
        <div className="relative flex-shrink-0" ref={shortcutsWrapRef}>
          <button
            onClick={() => setShowShortcuts((v) => !v)}
            className="w-5 h-5 rounded-full border border-subtle text-muted hover:border-accent hover:text-accent transition font-mono text-xs flex items-center justify-center select-none"
            title="Keyboard shortcuts"
          >
            ?
          </button>
          {showShortcuts && (
            <div className="absolute bottom-full right-0 mb-2 w-60 bg-surface border border-subtle rounded p-3 shadow-xl z-50">
              <p className="font-sans text-xs font-semibold text-white mb-2">Keyboard shortcuts</p>
              <div className="space-y-1.5 font-mono text-xs text-muted">
                {[
                  ['Space',       'Play / Pause'],
                  ['← / →',       'Seek ±5 s'],
                  ['Shift+← / →', 'Seek ±30 s'],
                  ['[ / ]',        'Speed down / up'],
                ].map(([key, label]) => (
                  <div key={key} className="flex justify-between gap-4">
                    <span className="text-accent">{key}</span>
                    <span>{label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Row 2: playback rate + volume ──────────────────────────────────── */}
      <div className="flex items-center gap-1.5">

        {/* Rate buttons */}
        <div className="flex gap-0.5">
          {RATES.map((r) => (
            <button
              key={r}
              onClick={() => onSetPlaybackRate(r)}
              className={`px-2 py-0.5 rounded font-mono text-xs transition select-none ${
                playbackRate === r
                  ? 'bg-accent text-bg font-medium'
                  : 'text-muted hover:text-white'
              }`}
            >
              {r}x
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {/* Mute toggle */}
        <button
          onClick={onToggleMute}
          className="text-muted hover:text-white transition flex-shrink-0 text-sm select-none"
          title={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted || volume === 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊'}
        </button>

        {/* Volume slider */}
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volDisplay}
          onChange={(e) => onSetVolume(parseFloat(e.target.value))}
          style={{
            background: `linear-gradient(to right, #63b3ed ${volPct}%, rgba(255,255,255,0.08) ${volPct}%)`,
          }}
          className={`w-20 h-1 rounded-full appearance-none cursor-pointer flex-shrink-0 ${thumbCls.replace(/w-3/g, 'w-2.5').replace(/h-3/g, 'h-2.5')}`}
        />
      </div>
    </div>
  );
};
