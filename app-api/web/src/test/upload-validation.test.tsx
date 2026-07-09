import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi, describe, test, expect, beforeEach } from 'vitest';
import { Upload } from '../pages/Upload';

vi.mock('../utils/api', () => ({
  apiClient: {
    getHealth: vi.fn(),
    getModels: vi.fn(),
  },
  default: {},
}));

vi.mock('../lib/api', () => ({
  apiUpload: vi.fn(),
  assetUrl: vi.fn((p: string) => p),
}));

import { apiClient } from '../utils/api';
import { apiUpload } from '../lib/api';

const renderUpload = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Upload />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

const healthOk = { data: { status: 'ok', speech_api: 'ok' } };
const modelsOk = {
  data: {
    transcription_models: [{ id: 'base', available: true }, { id: 'large-v3', available: true }],
    diarization_model: '',
    supports_word_timestamps: true,
    supports_diarization: false,
  },
};

beforeEach(() => {
  vi.mocked(apiClient.getHealth).mockResolvedValue(healthOk as any);
  vi.mocked(apiClient.getModels).mockResolvedValue(modelsOk as any);
});

describe('Upload page — file validation', () => {
  test('upload button is disabled when no file is selected', async () => {
    renderUpload();
    // Wait for health query to resolve
    await waitFor(() => expect(screen.getByTestId('speech-api-status')).toHaveTextContent('Ready'));
    expect(screen.getByTestId('upload-btn')).toBeDisabled();
  });

  test('upload button enables when a valid MP3 is selected', async () => {
    renderUpload();
    await waitFor(() => expect(screen.getByTestId('speech-api-status')).toHaveTextContent('Ready'));
    const input = screen.getByTestId('file-input');
    const file = new File(['audio'], 'meeting.mp3', { type: 'audio/mpeg' });
    await userEvent.upload(input, file);
    expect(screen.getByTestId('upload-btn')).not.toBeDisabled();
  });

  test('shows error for unsupported file type', async () => {
    renderUpload();
    await waitFor(() => expect(screen.getByTestId('speech-api-status')).toHaveTextContent('Ready'));
    const input = screen.getByTestId('file-input');
    const file = new File(['text'], 'notes.txt', { type: 'text/plain' });
    // applyAccept:false bypasses jsdom accept-attribute filtering so the onChange fires
    await userEvent.upload(input, file, { applyAccept: false });
    await waitFor(() => {
      expect(screen.getByTestId('upload-error')).toHaveTextContent(/unsupported|invalid|not supported/i);
    });
    expect(screen.getByTestId('upload-btn')).toBeDisabled();
  });

  test('accepts MP4 files', async () => {
    renderUpload();
    await waitFor(() => expect(screen.getByTestId('speech-api-status')).toHaveTextContent('Ready'));
    const input = screen.getByTestId('file-input');
    const file = new File(['video'], 'meeting.mp4', { type: 'video/mp4' });
    await userEvent.upload(input, file);
    expect(screen.queryByTestId('upload-error')).not.toBeInTheDocument();
    expect(screen.getByTestId('upload-btn')).not.toBeDisabled();
  });

  test('accepts WAV files', async () => {
    renderUpload();
    await waitFor(() => expect(screen.getByTestId('speech-api-status')).toHaveTextContent('Ready'));
    const input = screen.getByTestId('file-input');
    const file = new File(['audio'], 'meeting.wav', { type: 'audio/wav' });
    await userEvent.upload(input, file);
    expect(screen.queryByTestId('upload-error')).not.toBeInTheDocument();
    expect(screen.getByTestId('upload-btn')).not.toBeDisabled();
  });

  test('shows error for file exceeding 100 MB', async () => {
    renderUpload();
    await waitFor(() => expect(screen.getByTestId('speech-api-status')).toHaveTextContent('Ready'));
    const input = screen.getByTestId('file-input');
    const file = new File(['x'], 'huge.mp3', { type: 'audio/mpeg' });
    Object.defineProperty(file, 'size', { value: 101 * 1024 * 1024 });
    await userEvent.upload(input, file);
    expect(screen.getByTestId('upload-error')).toHaveTextContent(/too large|100/i);
    expect(screen.getByTestId('upload-btn')).toBeDisabled();
  });

  test('shows filename after valid file is selected', async () => {
    renderUpload();
    await waitFor(() => expect(screen.getByTestId('speech-api-status')).toHaveTextContent('Ready'));
    const input = screen.getByTestId('file-input');
    const file = new File(['audio'], 'my-meeting.mp3', { type: 'audio/mpeg' });
    await userEvent.upload(input, file);
    expect(screen.getByText(/my-meeting\.mp3/i)).toBeInTheDocument();
  });

  test('shows API error when upload fails', async () => {
    vi.mocked(apiUpload).mockRejectedValueOnce(new Error('Server error occurred'));
    renderUpload();
    await waitFor(() => expect(screen.getByTestId('speech-api-status')).toHaveTextContent('Ready'));
    const input = screen.getByTestId('file-input');
    await userEvent.upload(input, new File(['audio'], 'meeting.mp3', { type: 'audio/mpeg' }));
    await userEvent.click(screen.getByTestId('upload-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('upload-error')).toHaveTextContent(/server error/i);
    });
  });

  test('model selector is populated from /models endpoint', async () => {
    renderUpload();
    await waitFor(() => {
      expect(screen.getByDisplayValue(/base/i)).toBeInTheDocument();
    });
  });

  test('shows speech API offline when health returns unreachable', async () => {
    vi.mocked(apiClient.getHealth).mockResolvedValue({
      data: { status: 'ok', speech_api: 'unreachable' },
    } as any);
    renderUpload();
    await waitFor(() => {
      expect(screen.getByTestId('speech-api-status')).toHaveTextContent(/offline/i);
    });
    expect(screen.getByTestId('upload-btn')).toBeDisabled();
  });
});
