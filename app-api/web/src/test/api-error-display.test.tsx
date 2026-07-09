import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi, describe, test, expect, beforeEach } from 'vitest';
import { makeJob } from './factories';
import { Upload } from '../pages/Upload';
import { History } from '../pages/History';

vi.mock('../utils/api', () => ({
  apiClient: {
    getStatus: vi.fn(),
    getHealth: vi.fn(),
    getModels: vi.fn(),
    getJobs: vi.fn(),
    renameSpeaker: vi.fn(),
    editSegment: vi.fn(),
  },
  default: {},
}));

vi.mock('../lib/api', () => ({
  apiUpload: vi.fn(),
  assetUrl: vi.fn((p: string) => p),
}));

import { apiClient } from '../utils/api';
import { apiUpload } from '../lib/api';

const healthOk = { data: { status: 'ok', speech_api: 'ok' } };
const modelsOk = {
  data: {
    transcription_models: [{ id: 'base', available: true }],
    diarization_model: '',
    supports_word_timestamps: true,
    supports_diarization: false,
  },
};

const renderUpload = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><Upload /></MemoryRouter>
    </QueryClientProvider>,
  );
};

const renderHistory = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/history']}>
        <Routes>
          <Route path="/history" element={<History />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  vi.mocked(apiClient.getHealth).mockResolvedValue(healthOk as any);
  vi.mocked(apiClient.getModels).mockResolvedValue(modelsOk as any);
});

describe('API error display', () => {
  test('History page shows failed badge for failed jobs', async () => {
    vi.mocked(apiClient.getJobs).mockResolvedValue({
      data: { jobs: [makeJob({ status: 'failed' })] },
    } as any);
    renderHistory();
    await waitFor(() => {
      // History renders a status badge with exact text "failed"
      const badges = screen.getAllByText(/failed/i);
      expect(badges.length).toBeGreaterThan(0);
    });
  });

  test('Upload page shows Speech API offline status when unreachable', async () => {
    vi.mocked(apiClient.getHealth).mockResolvedValue({
      data: { status: 'ok', speech_api: 'unreachable' },
    } as any);
    renderUpload();
    await waitFor(() => {
      expect(screen.getByTestId('speech-api-status')).toHaveTextContent(/offline/i);
    });
  });

  test('network error during upload shows user-friendly message', async () => {
    vi.mocked(apiUpload).mockRejectedValueOnce(new Error('Network error'));
    renderUpload();
    await waitFor(() => screen.getByTestId('speech-api-status'));
    const input = screen.getByTestId('file-input');
    await userEvent.upload(input, new File(['audio'], 'meeting.mp3', { type: 'audio/mpeg' }));
    await userEvent.click(screen.getByTestId('upload-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('upload-error')).toHaveTextContent(/network error/i);
    });
  });
});
