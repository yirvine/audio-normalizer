# LUFS Audio Normalizer Web App

A web application for batch MP3 loudness normalization to a target integrated loudness (LUFS) and true peak (dBTP) using ffmpeg. The app exposes a drag‑and‑drop UI and Next.js API routes that perform analysis and normalization on the server.

## Features

- Batch MP3 upload (files or folders)
- Loudness analysis (integrated LUFS and true peak) via ffmpeg loudnorm
- Normalization with single, double, or triple pass options
- Zip packaging of normalized outputs
- 320 kbps MP3 output at 44.1 kHz

## Target parameters

- LUFS target: −7.5 LUFS (configurable)
- True peak target: −0.4 dBTP (configurable)

## Technology

- Frontend: Next.js 15, React 19, TypeScript
- Styling: Tailwind CSS 4
- Server: Next.js App Router API routes
- Audio processing: ffmpeg (loudnorm + limiter)

## Requirements

- Node.js 18+
- ffmpeg available in PATH
- npm or yarn

## Installation

```bash
git clone https://github.com/yirvine/audio-normalizer.git
cd mp3-normalizer
npm install
npm run dev
```

Open `http://localhost:3000`.

## Usage

1. Drag and drop MP3 files (or folders), or click to select files.
2. Optionally run analysis to view current LUFS and dBTP per file.
3. Normalize using single, double, or triple pass. The server returns a zip archive of processed files.

Download naming:
- Server archive name: `<base>_SN.zip` (single), `<base>_DN.zip` (double), `<base>_TN.zip` (triple)
- Current UI download name: `normalized_audio_<n>_files.zip`, `double_normalized_audio_<n>_files.zip`, `triple_normalized_audio_<n>_files.zip`

## Processing details

### Endpoints
- `POST /api/analyze`: extracts integrated LUFS and true peak using `loudnorm` (print_format=summary). Processed in batches of 20.
- `POST /api/normalize`: performs normalization and packages results. Processed in batches of 8.

### Analysis
Command shape:
```bash
ffmpeg -hide_banner -threads 2 -i <input> -af "loudnorm=I=<TARGET_LUFS>:TP=<TARGET_TP>:LRA=11:print_format=summary" -f null -
```

### Normalization
Flow per file:
1. Measure input LUFS with `loudnorm` (print_format=json).
2. Compute base gain: `TARGET_LUFS - input_i`. Apply a pass‑dependent multiplier.
3. Apply filter chain for loudness gain and true‑peak limiting, then encode MP3 320k at 44.1 kHz.

Filter chain used:
```text
volume=<gain>dB, aresample=resampler=soxr:out_sample_rate=192000, alimiter=limit=<linear(TP)>:attack=1:release=50:level=false, aresample=resampler=soxr:out_sample_rate=44100
```

Output encoding:
```bash
ffmpeg -y -threads 4 -i <input> -af "<filterchain>" -ar 44100 -c:a libmp3lame -b:a 320k <output>
```

Zip packaging is performed server‑side via `archiver` and returned as the response body; temporary files and directories are cleaned up after each request.

## Configuration

Targets are defined in `src/lib/config.ts` and used in both the client and API routes:
```typescript
export const AUDIO_CONFIG = {
  TARGET_LUFS: -7.5,
  TARGET_TP: -0.4,  // True Peak in dBTP
} as const;
export const { TARGET_LUFS, TARGET_TP } = AUDIO_CONFIG;
```

## Deployment

Designed to run on platforms that support Next.js App Router API routes (e.g., Vercel). Ensure `ffmpeg` is available in the execution environment.

## Notes

- Supported input: MP3. Output: MP3 320 kbps at 44.1 kHz.
- Concurrency is implemented via batched `Promise.all` execution (20 for analysis, 8 for normalization).

## License

MIT
