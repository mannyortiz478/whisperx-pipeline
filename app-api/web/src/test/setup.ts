import '@testing-library/jest-dom';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});

window.URL.createObjectURL = vi.fn(() => 'blob:mock');
window.URL.revokeObjectURL = vi.fn();

// jsdom doesn't implement HTMLMediaElement playback
Object.defineProperty(window.HTMLMediaElement.prototype, 'play', {
  writable: true,
  value: vi.fn().mockResolvedValue(undefined),
});
Object.defineProperty(window.HTMLMediaElement.prototype, 'pause', {
  writable: true,
  value: vi.fn(),
});
Object.defineProperty(window.HTMLMediaElement.prototype, 'load', {
  writable: true,
  value: vi.fn(),
});

// AudioContext used by waveform loader — let it fail gracefully
(window as any).AudioContext = vi.fn(() => ({
  decodeAudioData: vi.fn().mockRejectedValue(new Error('not implemented in jsdom')),
  close: vi.fn().mockResolvedValue(undefined),
}));

// RAF stubs so useAudioPlayer doesn't throw
window.requestAnimationFrame = vi.fn((cb) => { setTimeout(cb, 0); return 1; }) as any;
window.cancelAnimationFrame = vi.fn();
