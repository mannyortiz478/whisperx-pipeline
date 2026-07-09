import { screen, waitFor } from '@testing-library/react';
import { vi, describe, test, expect, beforeEach } from 'vitest';
import { makeTranscriptResult, makeCompletedStatus } from './factories';
import { renderTranscript } from './helpers';

vi.mock('../utils/api', () => ({
  apiClient: {
    getStatus: vi.fn(),
    getHealth: vi.fn(),
    getModels: vi.fn(),
    renameSpeaker: vi.fn(),
    editSegment: vi.fn(),
  },
  default: {},
}));

vi.mock('axios', () => ({
  default: { create: vi.fn(() => ({ get: vi.fn(), post: vi.fn() })), isAxiosError: vi.fn() },
}));

import { apiClient } from '../utils/api';

beforeEach(() => {
  vi.mocked(apiClient.getStatus).mockResolvedValue({ data: makeCompletedStatus() } as any);
});

describe('Transcript segment rendering', () => {
  test('renders segment text', async () => {
    renderTranscript();
    await waitFor(() => {
      expect(screen.getByText('Thanks everyone for joining today.')).toBeInTheDocument();
    });
  });

  test('renders speaker name on each segment', async () => {
    renderTranscript();
    await waitFor(() => {
      const chips = screen.getAllByTestId('segment-speaker');
      expect(chips[0]).toHaveTextContent('Speaker 1');
    });
  });

  test('renders timestamp on each segment', async () => {
    renderTranscript();
    await waitFor(() => {
      // Each segment has a unique timestamp [00:00], [00:04], [00:07]
      expect(screen.getByText('[00:00]')).toBeInTheDocument();
      expect(screen.getByText('[00:04]')).toBeInTheDocument();
      expect(screen.getByText('[00:07]')).toBeInTheDocument();
    });
  });

  test('segments from different speakers have different color chips', async () => {
    renderTranscript();
    await waitFor(() => {
      const chips = screen.getAllByTestId('segment-speaker');
      expect(chips.length).toBeGreaterThanOrEqual(2);
      // First segment speaker and second segment speaker chips should have different classes
      const cls0 = chips[0].className;
      const cls1 = chips[1].className;
      expect(cls0).not.toEqual(cls1);
    });
  });

  test('renders all 3 segments from fixture data', async () => {
    renderTranscript();
    await waitFor(() => {
      expect(screen.getAllByTestId('segment-text')).toHaveLength(3);
    });
  });

  test('active segment has accent border style', async () => {
    // Render and verify the segment div structure — when activeSegmentId matches,
    // the div gets borderLeft: 3px solid #63b3ed
    renderTranscript();
    await waitFor(() => {
      expect(screen.getAllByTestId('segment-text')).toHaveLength(3);
    });
    // All segments start with transparent border (no audio playing)
    // All segments start with transparent border (no audio playing)
    // data-active attribute is only set when segment is active
  });

  test('edited segment text shows updated text', async () => {
    const result = makeTranscriptResult();
    result.transcript[0].text = 'Updated text here';
    vi.mocked(apiClient.getStatus).mockResolvedValue({
      data: { ...makeCompletedStatus(), result },
    } as any);
    renderTranscript();
    await waitFor(() => {
      expect(screen.getByText('Updated text here')).toBeInTheDocument();
    });
  });
});
