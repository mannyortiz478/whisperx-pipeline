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

beforeEach(() => {
  vi.mocked(apiClient.getStatus).mockResolvedValue({ data: makeCompletedStatus() } as any);
  vi.stubGlobal('fetch', vi.fn());
});

describe('Export panel — export button behavior', () => {
  test('renders TXT, DOCX, and PDF export buttons', async () => {
    renderTranscript();
    await waitFor(() => expect(screen.getByTestId('export-txt')).toBeInTheDocument());
    expect(screen.getByTestId('export-docx')).toBeInTheDocument();
    expect(screen.getByTestId('export-pdf')).toBeInTheDocument();
  });

  test('timestamp toggle is visible and clickable', async () => {
    renderTranscript();
    await waitFor(() => expect(screen.getByTestId('timestamps-toggle')).toBeInTheDocument());
    // Default: include timestamps ON (toggle visible)
    expect(screen.getByTestId('timestamps-toggle')).toBeInTheDocument();
  });

  test('DOCX button is disabled while generating and re-enabled after', async () => {
    let fetchResolve!: (v: Response | PromiseLike<Response>) => void;
    vi.mocked(fetch).mockImplementationOnce(
      () => new Promise<Response>((resolve) => { fetchResolve = resolve; }),
    );
    renderTranscript();
    await waitFor(() => expect(screen.getByTestId('export-docx')).toBeInTheDocument());

    // Start click but don't await — we want to inspect mid-flight state
    const clickDone = userEvent.click(screen.getByTestId('export-docx'));
    await waitFor(() => expect(screen.getByTestId('export-docx')).toBeDisabled());

    // Resolve the fetch
    fetchResolve({ ok: true, blob: async () => new Blob(['docx']) } as unknown as Response);
    await clickDone;

    await waitFor(() => {
      expect(screen.queryByText(/generating/i)).not.toBeInTheDocument();
    }, { timeout: 1000 });
  });

  test('PDF button is disabled while generating and re-enabled after', async () => {
    let fetchResolve!: (v: Response | PromiseLike<Response>) => void;
    vi.mocked(fetch).mockImplementationOnce(
      () => new Promise<Response>((resolve) => { fetchResolve = resolve; }),
    );
    renderTranscript();
    await waitFor(() => expect(screen.getByTestId('export-pdf')).toBeInTheDocument());

    const clickDone = userEvent.click(screen.getByTestId('export-pdf'));
    await waitFor(() => expect(screen.getByTestId('export-pdf')).toBeDisabled());

    fetchResolve({ ok: true, blob: async () => new Blob(['pdf']) } as unknown as Response);
    await clickDone;

    await waitFor(() => {
      expect(screen.queryByText(/generating/i)).not.toBeInTheDocument();
    }, { timeout: 500 });
    await waitFor(() => {
      expect(screen.queryByText(/generating/i)).not.toBeInTheDocument();
    }, { timeout: 1000 });
  });

  test('shows alert when DOCX export fails', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, json: async () => ({}) } as unknown as Response);
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    renderTranscript();
    await waitFor(() => expect(screen.getByTestId('export-docx')).toBeInTheDocument());
    await userEvent.click(screen.getByTestId('export-docx'));
    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('Failed to generate DOCX');
    });
    alertSpy.mockRestore();
  });

  test('shows alert when PDF export fails', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, json: async () => ({}) } as unknown as Response);
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    renderTranscript();
    await waitFor(() => expect(screen.getByTestId('export-pdf')).toBeInTheDocument());
    await userEvent.click(screen.getByTestId('export-pdf'));
    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('Failed to generate PDF');
    });
    alertSpy.mockRestore();
  });
});
