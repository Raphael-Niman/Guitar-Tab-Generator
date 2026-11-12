/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  Guitar,
  Sparkles,
  Camera,
  Layers,
  Volume2,
} from 'lucide-react';
import { ImageUploader } from './components/ImageUploader';
import { AlphaTabScore } from './components/AlphaTabScore';
import { CompressedImageResult } from './utils/imageCompressor';
import { assignErgonomicGuitarTab } from './utils/guitarTabFingering';
import { C_MAJOR_8_BAR_SAMPLE, SAMPLE_SONGS, SampleSong } from './data/samples';

export default function App() {
  // Current active MusicXML score (defaults to built-in 8-bar C Major melody for immediate interactivity)
  const [currentXml, setCurrentXml] = useState<string>(C_MAJOR_8_BAR_SAMPLE);
  const [uploadedPreview, setUploadedPreview] = useState<string | null>(null);

  // Transcription state
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcriptionStep, setTranscriptionStep] = useState('');
  const [transcriptionError, setTranscriptionError] = useState<string | null>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  // Server health state
  const [serverHealth, setServerHealth] = useState<{ checked: boolean; hasApiKey: boolean }>({
    checked: false,
    hasApiKey: true,
  });

  // Active sample preset
  const [selectedSampleId, setSelectedSampleId] = useState<string>('c-major-8-bar');

  // Verify backend health on mount
  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((data) => {
        setServerHealth({ checked: true, hasApiKey: data.hasApiKey });
      })
      .catch((err) => {
        console.warn('Backend health check error:', err);
        setServerHealth({ checked: true, hasApiKey: false });
      });
  }, []);

  // Safely parse JSON responses even if a proxy modifies Content-Type or returns HTML on transient gateway timeouts
  const parseJsonSafely = async (response: Response): Promise<{ ok: boolean; json: any; nonJsonError?: string }> => {
    const rawText = await response.text();
    const trimmed = rawText.trim();

    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        return { ok: true, json: JSON.parse(trimmed) };
      } catch {
        // Fall through to descriptive error below
      }
    }

    if (response.status === 413) {
      return {
        ok: false,
        json: null,
        nonJsonError: 'Image size is too large for the server. Please try a smaller or cropped photo.',
      };
    }

    if (response.status === 502 || response.status === 503 || response.status === 504) {
      return {
        ok: false,
        json: null,
        nonJsonError: 'The AI transcription service is temporarily busy. Please click Retry in a few seconds.',
      };
    }

    if (!trimmed || trimmed.startsWith('<!doctype') || trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')) {
      return {
        ok: false,
        json: null,
        nonJsonError: 'Connection interrupted while waiting for server response. Please click Retry.',
      };
    }

    return {
      ok: false,
      json: null,
      nonJsonError: `Unexpected server response (HTTP ${response.status}). Please click Retry.`,
    };
  };

  // Transcribe uploaded compressed image using async job polling (immune to reverse-proxy idle timeouts)
  const handleTranscribe = async (compressed: CompressedImageResult) => {
    setIsTranscribing(true);
    setTranscriptionError(null);
    setTranscriptionStep('Uploading high-res sheet music photo...');
    setUploadedPreview(compressed.dataUrl);

    try {
      const startResponse = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: compressed.dataUrl,
          mimeType: 'image/jpeg',
          title: compressed.fileName.replace(/\.[^/.]+$/, ''),
          async: true,
        }),
      });

      const parsedStart = await parseJsonSafely(startResponse);
      if (!parsedStart.ok) {
        throw new Error(parsedStart.nonJsonError || 'Could not start sheet music transcription.');
      }

      let finalData = parsedStart.json;

      if (!startResponse.ok || !finalData?.success) {
        throw new Error(finalData?.error || `Transcription failed with status ${startResponse.status}`);
      }

      // Poll fast status endpoint until background streaming transcription completes
      if (finalData.async && finalData.jobId) {
        const jobId = finalData.jobId as string;
        setTranscriptionStep('Inspecting ledger lines, polyphonic voices & ties with Gemini Vision...');

        let consecutiveTransientErrors = 0;
        let lastObservedMeasures = 0;
        let lastProgressAt = Date.now();
        const maxIdleWithoutMeasuresMs = 6 * 60 * 1000; // 6 minutes without new progress
        const maxTotalWaitMs = 10 * 60 * 1000; // 10 minutes hard ceiling
        const pollStartedAt = Date.now();

        while (true) {
          const now = Date.now();
          if (now - pollStartedAt > maxTotalWaitMs || now - lastProgressAt > maxIdleWithoutMeasuresMs) {
            throw new Error('Transcription timed out on a very dense page. Please click Retry.');
          }

          await new Promise((resolve) => setTimeout(resolve, 1500));

          let statusRes: Response;
          try {
            statusRes = await fetch(`/api/transcribe/status/${encodeURIComponent(jobId)}`, {
              method: 'GET',
              headers: { Accept: 'application/json' },
              cache: 'no-store',
            });
          } catch {
            consecutiveTransientErrors++;
            if (consecutiveTransientErrors >= 6) {
              throw new Error('Lost network connection while polling transcription progress. Please click Retry.');
            }
            continue;
          }

          const parsedPoll = await parseJsonSafely(statusRes);
          if (!parsedPoll.ok) {
            consecutiveTransientErrors++;
            if (consecutiveTransientErrors >= 6) {
              throw new Error(parsedPoll.nonJsonError || 'Temporary server interruption. Please click Retry.');
            }
            continue;
          }

          consecutiveTransientErrors = 0;
          const pollData = parsedPoll.json;

          if (pollData.status === 'processing') {
            if (typeof pollData.measuresSoFar === 'number' && pollData.measuresSoFar > lastObservedMeasures) {
              lastObservedMeasures = pollData.measuresSoFar;
              lastProgressAt = Date.now();
            }
            if (pollData.progressStep) {
              const elapsedSuffix =
                typeof pollData.elapsedSeconds === 'number' && pollData.elapsedSeconds >= 4
                  ? ` (${pollData.elapsedSeconds}s)`
                  : '';
              setTranscriptionStep(`${pollData.progressStep}${elapsedSuffix}`);
            }
            continue;
          }

          if (pollData.status === 'completed' && pollData.success && pollData.musicXml) {
            finalData = pollData;
            break;
          }

          throw new Error(pollData?.error || 'Failed to transcribe sheet music.');
        }
      }

      const countText = finalData.measureCount ? ` (${finalData.measureCount} measures)` : '';
      setTranscriptionStep(`Generating ergonomic guitar tab${countText} & loading audio...`);
      const fingeredXml = assignErgonomicGuitarTab(finalData.musicXml);
      setCurrentXml(fingeredXml);
      setIsTruncated(Boolean(finalData.isTruncated));
      setSelectedSampleId(''); // Cleared custom

      // Smooth scroll down to the rendered tab
      setTimeout(() => {
        const scoreElem = document.getElementById('guitar-tab-score-section');
        if (scoreElem) {
          scoreElem.scrollIntoView({ behavior: 'smooth' });
        }
      }, 200);
    } catch (err: any) {
      console.error('Transcription error:', err);
      setTranscriptionError(err?.message || 'Failed to transcribe image.');
      throw err;
    } finally {
      setIsTranscribing(false);
      setTranscriptionStep('');
    }
  };

  const handleSelectSample = (sample: SampleSong) => {
    setCurrentXml(sample.xml);
    setSelectedSampleId(sample.id);
    setUploadedPreview(null);
    setIsTruncated(false);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-amber-500 selection:text-slate-950">
      {/* Top Navigation */}
      <header className="sticky top-0 z-40 bg-slate-950/85 backdrop-blur-xl border-b border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 via-orange-500 to-amber-600 flex items-center justify-center text-slate-950 font-black shadow-lg shadow-amber-500/20">
              <Guitar className="w-6 h-6 fill-slate-950 stroke-slate-950" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-extrabold text-base sm:text-lg tracking-tight bg-gradient-to-r from-amber-200 via-white to-amber-400 bg-clip-text text-transparent">
                  GuitarTabGenerator
                </h1>
                <span className="hidden sm:inline-block px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-[10px] font-bold text-amber-300">
                  OMR + Audio
                </span>
              </div>
              <p className="text-[11px] text-slate-400 hidden xs:block">
                Sheet Music Photo → Synced 6-String Tablature & Audio Playback
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Quick Sample Song Trigger */}
            <button
              type="button"
              onClick={() => handleSelectSample(SAMPLE_SONGS[0])}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs font-semibold transition-all active:scale-95"
              title="Load 8-bar C Major Acoustic Melody test song"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Load 8-Bar Sample</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Body */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 md:py-8 space-y-8">
        {/* Hero Section */}
        <div className="text-center max-w-3xl mx-auto space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-xs text-amber-400">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Gemini Vision Optical Music Recognition (OMR) & alphaTab Synthesizer</span>
          </div>
          <h2 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight">
            Turn Any Sheet Music Photo into{' '}
            <span className="bg-gradient-to-r from-amber-400 to-orange-400 bg-clip-text text-transparent">
              Playable Guitar Tablature
            </span>
          </h2>
          <p className="text-sm sm:text-base text-slate-400 leading-relaxed">
            Snap or upload a full page of guitar notation. The browser optimizes resolution up to 3072px (JPEG 0.92) to preserve razor-sharp rows, Gemini Vision transcribes every system and measure from top to bottom into MusicXML 3.1, and alphaTab renders multi-line 6-string tablature with audio playback.
          </p>
        </div>

        {/* Section 1: Upload & Image Compression */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-amber-500 text-slate-950 text-xs font-bold">
                1
              </span>
              <h3 className="font-bold text-slate-200 text-base">
                Upload Sheet Music Photo
              </h3>
            </div>
            <span className="text-xs text-slate-500">
              Full-Page High-Res Canvas (max 3072px) • JPEG 0.92
            </span>
          </div>

          <ImageUploader
            onTranscribe={handleTranscribe}
            isTranscribing={isTranscribing}
            transcriptionStep={transcriptionStep}
          />
        </section>

        {/* Section 2: Interactive Tablature & Audio Player */}
        <section id="guitar-tab-score-section" className="space-y-3 pt-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-amber-500 text-slate-950 text-xs font-bold">
                2
              </span>
              <h3 className="font-bold text-slate-200 text-base">
                Interactive Guitar Tablature & Audio Playback
              </h3>
            </div>

            {/* Preset Selector Buttons */}
            <div className="flex items-center gap-1.5 bg-slate-900/90 p-1 rounded-xl border border-slate-800 text-xs">
              <span className="text-slate-400 px-2 font-medium">Presets:</span>
              {SAMPLE_SONGS.map((sample) => (
                <button
                  key={sample.id}
                  type="button"
                  onClick={() => handleSelectSample(sample)}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                    selectedSampleId === sample.id
                      ? 'bg-amber-500 text-slate-950 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  {sample.title.split(' ')[0]} {sample.title.includes('8 Bars') ? '(8 Bars)' : ''}
                </button>
              ))}
            </div>
          </div>

          {/* alphaTab Interactive Score Component */}
          <AlphaTabScore
            xmlData={currentXml}
            onLoadSample={handleSelectSample}
            originalImagePreview={uploadedPreview}
            isTruncated={isTruncated}
          />
        </section>

        {/* Section 3: Feature Highlights & How it Works */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
          <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 space-y-2">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center font-bold text-sm">
              <Camera className="w-4 h-4" />
            </div>
            <h4 className="font-bold text-slate-200 text-sm">Full-Page High-Res Canvas</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              Images are automatically scaled to a high-resolution maximum 3072px dimension with 0.92 JPEG quality in the browser before upload, preserving razor-sharp noteheads on all vertical systems.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 space-y-2">
            <div className="w-8 h-8 rounded-xl bg-orange-500/10 text-orange-400 flex items-center justify-center font-bold text-sm">
              <Layers className="w-4 h-4" />
            </div>
            <h4 className="font-bold text-slate-200 text-sm">Polyphonic Multi-Voice OMR</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              High-reasoning vision inspects ledger lines, ties, accidentals, repeats, and separates up-stem melody (<code className="text-amber-400/90">&lt;voice&gt;1&lt;/voice&gt;</code>) and down-stem bass (<code className="text-amber-400/90">&lt;voice&gt;2&lt;/voice&gt;</code>) with collision-free 6-string frets.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 space-y-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-bold text-sm">
              <Volume2 className="w-4 h-4" />
            </div>
            <h4 className="font-bold text-slate-200 text-sm">alphaTab Audio & 6-String Tab</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              Synced standard notation and 6-string guitar tablature with SoundFont synthesizer audio playback, speed control (0.5x, 0.75x, 1.0x), and .xml file export.
            </p>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-800 bg-slate-950 py-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Guitar className="w-4 h-4 text-amber-500" />
            <span className="font-semibold text-slate-300">GuitarTabGenerator</span>
            <span>•</span>
            <span>MusicXML 3.1 & 6-String Guitar Notation</span>
          </div>
          <div>
            Built with Gemini Vision OMR, @coderline/alphatab, and Sonivox SoundFont.
          </div>
        </div>
      </footer>
    </div>
  );
}
