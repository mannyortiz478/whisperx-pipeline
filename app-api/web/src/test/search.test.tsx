import { screen, waitFor, fireEvent } from '@testing-library/react';
import { vi, describe, test, expect, beforeEach } from 'vitest';
import { makeCompletedStatus } from './factories';
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

describe('Transcript search behavior', () => {
  const setSearch = (value: string) => {
    const input = screen.getByTestId('search-input');
    fireEvent.change(input, { target: { value } });
  };

  test('typing in search input filters visible segments', async () => {
    renderTranscript();
    await waitFor(() => expect(screen.getAllByTestId('segment-text')).toHaveLength(3));
    setSearch('Friday');
    await waitFor(() => {
      expect(screen.getAllByTestId('segment-text')).toHaveLength(1);
    });
  });

  test('search is case insensitive', async () => {
    renderTranscript();
    await waitFor(() => expect(screen.getAllByTestId('segment-text')).toHaveLength(3));
    setSearch('friday');
    await waitFor(() => {
      expect(screen.getAllByTestId('segment-text')).toHaveLength(1);
    });
  });

  test('clearing search restores all segments', async () => {
    renderTranscript();
    await waitFor(() => expect(screen.getAllByTestId('segment-text')).toHaveLength(3));
    setSearch('Friday');
    await waitFor(() => expect(screen.getAllByTestId('segment-text')).toHaveLength(1));
    setSearch('');
    await waitFor(() => {
      expect(screen.getAllByTestId('segment-text')).toHaveLength(3);
    });
  });

  test('empty search shows all segments', async () => {
    renderTranscript();
    await waitFor(() => {
      expect(screen.getAllByTestId('segment-text')).toHaveLength(3);
    });
  });

  test('search with no matches shows no segment texts', async () => {
    renderTranscript();
    await waitFor(() => expect(screen.getAllByTestId('segment-text')).toHaveLength(3));
    setSearch('xyznotfound');
    await waitFor(() => {
      expect(screen.queryAllByTestId('segment-text')).toHaveLength(0);
    });
  });

  test('matching text is highlighted within the segment', async () => {
    renderTranscript();
    await waitFor(() => expect(screen.getAllByTestId('segment-text')).toHaveLength(3));
    setSearch('Friday');
    await waitFor(() => {
      const mark = document.querySelector('mark');
      expect(mark).toBeInTheDocument();
      expect(mark!.textContent?.toLowerCase()).toBe('friday');
    });
  });
});
