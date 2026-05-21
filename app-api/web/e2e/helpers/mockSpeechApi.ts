import http from 'http';
import { readFileSync } from 'fs';
import path from 'path';

const FIXTURE_PATH = path.resolve(
  process.cwd(),
  'e2e/fixtures/sample-speech-api-response.json',
);

const FIXTURE = JSON.parse(readFileSync(FIXTURE_PATH, 'utf-8'));

const MODELS_RESPONSE = {
  transcription_models: [
    { id: 'tiny',     available: true },
    { id: 'base',     available: true },
    { id: 'small',    available: true },
    { id: 'medium',   available: true },
    { id: 'large-v3', available: true },
  ],
  diarization_model: 'pyannote/speaker-diarization-3.1',
  supports_word_timestamps: true,
  supports_diarization: true,
};

export interface MockSpeechApi {
  stop(): Promise<void>;
}

export function startMockSpeechApi(port = 8000): Promise<MockSpeechApi> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      // Always drain the request body first
      const chunks: Buffer[] = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => {
        const url  = req.url || '';
        const method = req.method || 'GET';

        if (method === 'GET' && url.startsWith('/health')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'ok' }));
          return;
        }

        if (method === 'GET' && url.startsWith('/models')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(MODELS_RESPONSE));
          return;
        }

        if (method === 'POST' && url.startsWith('/process-audio')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(FIXTURE));
          return;
        }

        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ detail: 'Not found' }));
      });
    });

    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        reject(new Error(`Port ${port} is already in use. Stop the real speech-api before running E2E tests.`));
      } else {
        reject(err);
      }
    });

    server.listen(port, '127.0.0.1', () => {
      resolve({
        stop: () =>
          new Promise((res, rej) =>
            server.close((e) => (e ? rej(e) : res())),
          ),
      });
    });
  });
}
