#!/usr/bin/env node
// Generates binary fixture files used by Playwright E2E tests.
// Run once: node e2e/fixtures/generate-fixtures.js

import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── sample-short.mp3 ────────────────────────────────────────────────────────
// Minimal valid MP3: ID3v2 header + one silent MPEG1 Layer3 frame.
// Flask only checks the extension; mock speech API ignores file content.
// ID3v2.3 header (10 bytes): magic + version + flags + syncsafe size=0
const id3 = Buffer.from([0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

// MPEG1, Layer III, 128kbps, 44100 Hz, Stereo
// Frame size = floor(144 * 128000 / 44100) + 0 padding = 417 bytes
// Header: 0xFF 0xFB 0x90 0x64  (0x90=44100Hz joint-stereo, 0x64=mode ext)
const mpegHeader = Buffer.from([0xff, 0xfb, 0x90, 0x64]);
const frameBody  = Buffer.alloc(417 - 4, 0x00); // silent PCM zeros

const mp3 = Buffer.concat([id3, mpegHeader, frameBody]);
writeFileSync(join(__dirname, 'sample-short.mp3'), mp3);
console.log('✓ sample-short.mp3', mp3.length, 'bytes');

// ── invalid-file.txt ─────────────────────────────────────────────────────────
writeFileSync(join(__dirname, 'invalid-file.txt'), 'This is not an audio file.\n');
console.log('✓ invalid-file.txt');

console.log('\nAll fixtures generated.');
