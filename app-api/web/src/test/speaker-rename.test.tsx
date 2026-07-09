import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

const mockRenameOk = (speakerId: string, newName: string) =>
  vi.mocked(apiClient.renameSpeaker).mockResolvedValueOnce({
    data: { speaker_id: speakerId, original_label: 'SPEAKER_00', display_name: newName },
  } as any);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiClient.getStatus).mockResolvedValue({ data: makeCompletedStatus() } as any);
});

describe('Speaker rename behavior', () => {
  test('clicking speaker label enters edit mode', async () => {
    renderTranscript();
    await waitFor(() => screen.getAllByTestId('speaker-label'));
    await userEvent.click(screen.getAllByTestId('speaker-label')[0]);
    expect(screen.getByRole('textbox', { name: /rename speaker/i })).toBeInTheDocument();
  });

  test('typing new name and pressing Enter calls rename API', async () => {
    mockRenameOk('spk_001', 'Alex');
    renderTranscript();
    await waitFor(() => screen.getAllByTestId('speaker-label'));
    await userEvent.click(screen.getAllByTestId('speaker-label')[0]);
    const input = screen.getByRole('textbox', { name: /rename speaker/i });
    await userEvent.clear(input);
    await userEvent.type(input, 'Alex');
    await userEvent.keyboard('{Enter}');
    await waitFor(() => {
      expect(apiClient.renameSpeaker).toHaveBeenCalledWith('job_test123', 'spk_001', 'Alex');
    });
  });

  test('pressing Escape cancels edit without saving', async () => {
    renderTranscript();
    await waitFor(() => screen.getAllByTestId('speaker-label'));
    await userEvent.click(screen.getAllByTestId('speaker-label')[0]);
    const input = screen.getByRole('textbox', { name: /rename speaker/i });
    await userEvent.clear(input);
    await userEvent.type(input, 'ShouldNotSave');
    await userEvent.keyboard('{Escape}');
    expect(apiClient.renameSpeaker).not.toHaveBeenCalled();
    // Edit mode closed — original label visible again
    await waitFor(() => {
      expect(screen.getAllByTestId('speaker-label').length).toBeGreaterThan(0);
    });
  });

  test('all segments for renamed speaker update after rename', async () => {
    mockRenameOk('spk_001', 'Alex');
    renderTranscript();
    await waitFor(() => screen.getAllByTestId('speaker-label'));
    await userEvent.click(screen.getAllByTestId('speaker-label')[0]);
    const input = screen.getByRole('textbox', { name: /rename speaker/i });
    await userEvent.clear(input);
    await userEvent.type(input, 'Alex');
    await userEvent.keyboard('{Enter}');
    await waitFor(() => {
      const chips = screen.getAllByTestId('segment-speaker');
      const alexChips = chips.filter((c) => c.textContent === 'Alex');
      expect(alexChips.length).toBeGreaterThanOrEqual(2);
    });
  });

  test('shows error alert when rename API fails', async () => {
    vi.mocked(apiClient.renameSpeaker).mockRejectedValueOnce(new Error('Network error'));
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    renderTranscript();
    await waitFor(() => screen.getAllByTestId('speaker-label'));
    await userEvent.click(screen.getAllByTestId('speaker-label')[0]);
    const input = screen.getByRole('textbox', { name: /rename speaker/i });
    await userEvent.clear(input);
    await userEvent.type(input, 'Alex');
    await userEvent.keyboard('{Enter}');
    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('Failed to rename speaker');
    });
    alertSpy.mockRestore();
  });
});
