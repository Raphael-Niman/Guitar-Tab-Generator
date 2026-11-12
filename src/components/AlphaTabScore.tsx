import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as alphaTab from '@coderline/alphatab';
import {
  Play,
  Pause,
  Square,
  Download,
  Music,
  Volume2,
  VolumeX,
  ZoomIn,
  ZoomOut,
  Eye,
  Code,
  Sparkles,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { cleanMusicXmlForAlphaTab, downloadMusicXmlFile, extractScoreMeta, ScoreMeta } from '../utils/musicXmlHelper';
import { ensureGuitarScoreConfig } from '../utils/guitarScoreProcessor';
import { assignErgonomicGuitarTab } from '../utils/guitarTabFingering';
import { SAMPLE_SONGS, SampleSong } from '../data/samples';

interface AlphaTabScoreProps {
  xmlData: string;
  onLoadSample: (song: SampleSong) => void;
  originalImagePreview?: string | null;
  isTruncated?: boolean;
}

export const AlphaTabScore: React.FC<AlphaTabScoreProps> = ({
  xmlData,
  onLoadSample,
  originalImagePreview,
  isTruncated = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<alphaTab.AlphaTabApi | null>(null);
  const isInitializedRef = useRef(false);

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSoundFontLoaded, setIsSoundFontLoaded] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [endTimeMs, setEndTimeMs] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [metronomeEnabled, setMetronomeEnabled] = useState(false);

  // Visual layout state
  const [staveProfile, setStaveProfile] = useState<number>(alphaTab.StaveProfile.ScoreTab);
  const [zoomLevel, setZoomLevel] = useState<number>(1.0);
  const [isRenderLoading, setIsRenderLoading] = useState(true);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [showXmlModal, setShowXmlModal] = useState(false);
  const [showSideBySide, setShowSideBySide] = useState(false);
  const [copiedXml, setCopiedXml] = useState(false);
  const [editableXml, setEditableXml] = useState(xmlData);
  const [scoreMeta, setScoreMeta] = useState<ScoreMeta>(() => extractScoreMeta(xmlData));

  // Log warning if transcription was cut off by token limit
  useEffect(() => {
    if (isTruncated) {
      console.warn(
        '[OMR] Warning: The sheet music transcription was cut off because it reached the MAX_TOKENS limit (finishReason === "MAX_TOKENS").'
      );
    }
  }, [isTruncated]);

  // Format time MM:SS
  const formatTime = (ms: number) => {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  /**
   * Loads and renders a MusicXML string safely with guaranteed guitar tuning
   */
  const loadScoreXml = useCallback((rawXml: string) => {
    if (!apiRef.current) return;
    // Apply deterministic ergonomic guitar fingering & standard staff tuning
    const fingeredXml = assignErgonomicGuitarTab(rawXml);
    const sanitized = cleanMusicXmlForAlphaTab(fingeredXml);
    if (!sanitized) return;

    try {
      setRenderError(null);
      setIsRenderLoading(true);

      const bytes = new TextEncoder().encode(sanitized);

      try {
        // Attempt clean pre-parse with ScoreLoader to configure guitar tuning
        const score = alphaTab.importer.ScoreLoader.loadScoreFromBytes(bytes, apiRef.current.settings);
        ensureGuitarScoreConfig(score);
        apiRef.current.renderScore(score);
        if (score.title) {
          setScoreMeta((prev) => ({ ...prev, title: score.title }));
        }
      } catch (parseErr) {
        console.warn('ScoreLoader direct parse fallback to api.load:', parseErr);
        // Fallback to standard api.load
        apiRef.current.load(bytes);
      }
    } catch (err: any) {
      console.error('Error loading MusicXML:', err);
      setRenderError(err?.message || 'Could not render musical notation.');
      setIsRenderLoading(false);
    }
  }, []);

  // Initialize alphaTab API once
  useEffect(() => {
    if (!containerRef.current || isInitializedRef.current) return;
    isInitializedRef.current = true;

    const settings = new alphaTab.Settings();
    settings.core.fontDirectory = 'https://cdn.jsdelivr.net/npm/@coderline/alphatab@latest/dist/font/';
    settings.core.useWorkers = false;
    settings.display.layoutMode = alphaTab.LayoutMode.Page;
    settings.display.barsPerRow = 4;
    settings.display.staveProfile = staveProfile;
    settings.display.scale = zoomLevel;
    settings.player.enablePlayer = true;
    settings.player.soundFont = 'https://cdn.jsdelivr.net/npm/@coderline/alphatab@latest/dist/soundfont/sonivox.sf2';

    // Enable metadata elements
    settings.notation.elements.set(alphaTab.NotationElement.ScoreTitle, true);
    settings.notation.elements.set(alphaTab.NotationElement.ScoreSubTitle, true);
    settings.notation.elements.set(alphaTab.NotationElement.ScoreArtist, true);
    settings.notation.elements.set(alphaTab.NotationElement.GuitarTuning, true);

    const api = new alphaTab.AlphaTabApi(containerRef.current, settings);
    apiRef.current = api;

    // Listeners
    api.soundFontLoaded.on(() => {
      setIsSoundFontLoaded(true);
    });

    api.playerReady.on(() => {
      setIsSoundFontLoaded(true);
    });

    api.playerStateChanged.on((args) => {
      setIsPlaying(args.state === 1);
    });

    api.playerPositionChanged.on((args) => {
      setCurrentTimeMs(args.currentTime);
      setEndTimeMs(args.endTime);
    });

    api.renderStarted.on(() => {
      setIsRenderLoading(true);
    });

    api.renderFinished.on(() => {
      setIsRenderLoading(false);
      setRenderError(null);
    });

    // Score loaded hook: ensure guitar tuning and frets are ALWAYS populated
    api.scoreLoaded.on((score) => {
      setIsRenderLoading(false);
      if (score) {
        ensureGuitarScoreConfig(score);
        if (score.title) {
          setScoreMeta((prev) => ({ ...prev, title: score.title }));
        }
      }
    });

    // Handle alphaTab internal errors gracefully
    api.error.on((error: any) => {
      console.warn('[AlphaTab] Caught error:', error);
      setIsRenderLoading(false);
      // If error was caused by stave mismatch, fallback to Default staveProfile
      if (String(error?.message || error).includes('staves') && apiRef.current) {
        try {
          apiRef.current.settings.display.staveProfile = alphaTab.StaveProfile.Default;
          apiRef.current.updateSettings();
          apiRef.current.render();
        } catch (e) {
          console.warn('Fallback render attempt error:', e);
        }
      }
    });

    // Load initial score XML
    if (xmlData) {
      const fingered = assignErgonomicGuitarTab(xmlData);
      setEditableXml(fingered);
      loadScoreXml(fingered);
    }

    return () => {
      try {
        api.destroy();
      } catch (e) {
        // cleanup safe
      }
      apiRef.current = null;
      isInitializedRef.current = false;
    };
  }, []); // Run on mount

  // Handle xmlData prop updates (e.g. When new transcription finishes or sample is loaded)
  useEffect(() => {
    const fingered = assignErgonomicGuitarTab(xmlData);
    setEditableXml(fingered);
    setScoreMeta(extractScoreMeta(fingered));
    if (apiRef.current && isInitializedRef.current) {
      loadScoreXml(fingered);
    }
  }, [xmlData, loadScoreXml]);

  // Handle Play / Pause
  const handlePlayPause = useCallback(() => {
    if (!apiRef.current) return;
    apiRef.current.playPause();
  }, []);

  // Handle Stop
  const handleStop = useCallback(() => {
    if (!apiRef.current) return;
    apiRef.current.stop();
    setIsPlaying(false);
    setCurrentTimeMs(0);
  }, []);

  // Handle Playback speed change
  const handleSpeedChange = (speed: number) => {
    setPlaybackSpeed(speed);
    if (apiRef.current) {
      apiRef.current.playbackSpeed = speed;
    }
  };

  // Handle Stave Profile change (Notation & Tab / Tab only / Notation only)
  const handleStaveProfileChange = (profile: number) => {
    setStaveProfile(profile);
    if (apiRef.current) {
      try {
        if (apiRef.current.score) {
          ensureGuitarScoreConfig(apiRef.current.score);
        }
        apiRef.current.settings.display.staveProfile = profile;
        apiRef.current.updateSettings();
        apiRef.current.render();
      } catch (e) {
        console.warn('Error switching stave profile:', e);
      }
    }
  };

  // Handle Zoom change
  const handleZoomChange = (delta: number) => {
    const newZoom = Math.min(1.8, Math.max(0.6, parseFloat((zoomLevel + delta).toFixed(2))));
    setZoomLevel(newZoom);
    if (apiRef.current) {
      apiRef.current.settings.display.scale = newZoom;
      apiRef.current.updateSettings();
      apiRef.current.render();
    }
  };

  const handleResetZoom = () => {
    setZoomLevel(1.0);
    if (apiRef.current) {
      apiRef.current.settings.display.scale = 1.0;
      apiRef.current.updateSettings();
      apiRef.current.render();
    }
  };

  // Handle Mute toggle
  const handleToggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (apiRef.current) {
      apiRef.current.masterVolume = nextMuted ? 0 : 1;
    }
  };

  // Handle Metronome toggle
  const handleToggleMetronome = () => {
    const nextVal = !metronomeEnabled;
    setMetronomeEnabled(nextVal);
    if (apiRef.current) {
      apiRef.current.metronomeVolume = nextVal ? 1.0 : 0.0;
    }
  };

  // Handle Timeline Scrubber Click
  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!apiRef.current || endTimeMs <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickRatio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetMs = clickRatio * endTimeMs;
    apiRef.current.timePosition = targetMs;
    setCurrentTimeMs(targetMs);
  };

  // Apply edited XML
  const handleApplyEditedXml = () => {
    const fingered = assignErgonomicGuitarTab(editableXml);
    setEditableXml(fingered);
    loadScoreXml(fingered);
    setScoreMeta(extractScoreMeta(fingered));
    setShowXmlModal(false);
  };

  const progressPercent = endTimeMs > 0 ? Math.min(100, (currentTimeMs / endTimeMs) * 100) : 0;

  return (
    <div className="w-full bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
      {/* Top Header / Meta Bar */}
      <div className="bg-slate-950/80 px-4 md:px-6 py-3.5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <Music className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base md:text-lg font-bold text-slate-100 flex items-center gap-2">
              {scoreMeta.title || 'Interactive 6-String Guitar Tablature'}
            </h2>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="text-amber-400/90 font-mono font-medium">Standard Tuning (E A D G B E)</span>
              <span>•</span>
              <span>{scoreMeta.beats}/{scoreMeta.beatType} Time</span>
              {scoreMeta.tempo > 0 && (
                <>
                  <span>•</span>
                  <span>♩ = {scoreMeta.tempo} BPM</span>
                </>
              )}
              {scoreMeta.measureCount > 0 && (
                <>
                  <span>•</span>
                  <span>{scoreMeta.measureCount} Measures</span>
                </>
              )}
              {scoreMeta.voiceCount > 1 && (
                <>
                  <span>•</span>
                  <span className="text-emerald-400 font-medium">
                    Polyphonic ({scoreMeta.voiceCount} Voices)
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Status badges & Sample selector */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Rendered measures status badge */}
          <div
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 border border-emerald-500/35 text-emerald-300 shadow-sm"
            title={`${scoreMeta.measureCount} total measures detected and rendered cleanly down the page`}
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>Rendered {scoreMeta.measureCount} measures</span>
          </div>

          {/* Truncation Warning Badge */}
          {isTruncated && (
            <div
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/20 border border-amber-500/40 text-amber-300 animate-pulse"
              title="Gemini transcription was cut off by token limit (MAX_TOKENS)"
            >
              <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
              <span>Cut off (MAX_TOKENS)</span>
            </div>
          )}

          {/* SoundFont status */}
          <div
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
              isSoundFontLoaded
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
            }`}
            title={isSoundFontLoaded ? 'Sonivox SoundFont Ready' : 'Loading SoundFont...'}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isSoundFontLoaded ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400 animate-ping'
              }`}
            />
            <span>{isSoundFontLoaded ? 'Synth Ready' : 'Loading Audio...'}</span>
          </div>

          {/* Load Sample Song Button */}
          <button
            type="button"
            onClick={() => onLoadSample(SAMPLE_SONGS[0])}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 text-xs font-semibold transition-all active:scale-95 cursor-pointer"
            title="Load 8-Bar C Major Acoustic Melody built-in sample"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            Load Sample Song (8 Bars)
          </button>

          {/* Download .xml Button */}
          <button
            type="button"
            onClick={() => downloadMusicXmlFile(editableXml || xmlData, `${scoreMeta.title.replace(/\s+/g, '-').toLowerCase() || 'guitar-tab'}.xml`)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold transition-all shadow-sm active:scale-95 cursor-pointer"
            title="Download clean MusicXML 3.1 file"
          >
            <Download className="w-3.5 h-3.5 text-slate-300" />
            Download .xml
          </button>
        </div>
      </div>

      {/* Main Interactive Toolbar */}
      <div className="bg-slate-900 px-4 md:px-6 py-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
        {/* Playback Controls Group */}
        <div className="flex items-center gap-2">
          {/* Play / Pause Button */}
          <button
            type="button"
            onClick={handlePlayPause}
            className={`inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl font-bold text-sm transition-all shadow-md active:scale-95 cursor-pointer ${
              isPlaying
                ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/25'
                : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/25'
            }`}
            title="Play / Pause (or press Space)"
          >
            {isPlaying ? (
              <>
                <Pause className="w-4 h-4 fill-slate-950" />
                <span>Pause</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-slate-950" />
                <span>Play Tab</span>
              </>
            )}
          </button>

          {/* Stop Button */}
          <button
            type="button"
            onClick={handleStop}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-all active:scale-95 cursor-pointer"
            title="Stop & Reset to Start"
          >
            <Square className="w-4 h-4 fill-current" />
          </button>

          {/* Playback Speed Selector (0.5x, 0.75x, 1.0x, 1.25x) */}
          <div className="flex items-center bg-slate-950 rounded-xl p-0.5 border border-slate-800">
            {[0.5, 0.75, 1.0, 1.25].map((speed) => (
              <button
                key={speed}
                type="button"
                onClick={() => handleSpeedChange(speed)}
                className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  playbackSpeed === speed
                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
                title={`Playback Speed ${speed}x`}
              >
                {speed}x
              </button>
            ))}
          </div>

          {/* Metronome Toggle */}
          <button
            type="button"
            onClick={handleToggleMetronome}
            className={`px-2.5 py-1.5 rounded-xl text-xs font-medium border transition-all cursor-pointer ${
              metronomeEnabled
                ? 'bg-amber-500/20 border-amber-500/40 text-amber-300 font-semibold'
                : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
            title="Toggle Metronome Audio"
          >
            Metronome: {metronomeEnabled ? 'ON' : 'OFF'}
          </button>

          {/* Mute Toggle */}
          <button
            type="button"
            onClick={handleToggleMute}
            className={`p-2 rounded-xl text-xs border transition-all cursor-pointer ${
              isMuted
                ? 'bg-red-500/20 border-red-500/30 text-red-400'
                : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>

        {/* View Mode & Zoom Controls */}
        <div className="flex items-center gap-2">
          {/* Stave Profile: Score+Tab, Tab only, Score only */}
          <div className="flex items-center bg-slate-950 rounded-xl p-0.5 border border-slate-800">
            <button
              type="button"
              onClick={() => handleStaveProfileChange(alphaTab.StaveProfile.ScoreTab)}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                staveProfile === alphaTab.StaveProfile.ScoreTab
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Standard Notation + 6-String Guitar Tab"
            >
              Score + Tab
            </button>
            <button
              type="button"
              onClick={() => handleStaveProfileChange(alphaTab.StaveProfile.Tab)}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                staveProfile === alphaTab.StaveProfile.Tab
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Guitar Tablature Only"
            >
              Tab Only
            </button>
            <button
              type="button"
              onClick={() => handleStaveProfileChange(alphaTab.StaveProfile.Score)}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                staveProfile === alphaTab.StaveProfile.Score
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Standard Notation Only"
            >
              Score Only
            </button>
          </div>

          {/* Zoom controls */}
          <div className="flex items-center bg-slate-950 rounded-xl p-0.5 border border-slate-800">
            <button
              type="button"
              onClick={() => handleZoomChange(-0.1)}
              className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 rounded-lg transition-colors cursor-pointer"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleResetZoom}
              className="px-1.5 text-[11px] font-mono text-slate-400 cursor-pointer hover:text-amber-400"
              title="Reset Zoom to 100%"
            >
              {Math.round(zoomLevel * 100)}%
            </button>
            <button
              type="button"
              onClick={() => handleZoomChange(0.1)}
              className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 rounded-lg transition-colors cursor-pointer"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Side by side with original sheet music toggle */}
          {originalImagePreview && (
            <button
              type="button"
              onClick={() => setShowSideBySide(!showSideBySide)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                showSideBySide
                  ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                  : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'
              }`}
              title="Compare side-by-side with original photo"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Original Photo</span>
            </button>
          )}

          {/* View/Edit MusicXML button */}
          <button
            type="button"
            onClick={() => setShowXmlModal(true)}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-all cursor-pointer"
            title="Inspect or tweak MusicXML 3.1 code"
          >
            <Code className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Playback Progress Scrubber Bar */}
      <div className="bg-slate-950 px-4 md:px-6 py-2 border-b border-slate-800/60 flex items-center gap-3">
        <span className="font-mono text-xs text-amber-400 w-11 text-right">
          {formatTime(currentTimeMs)}
        </span>
        <div
          onClick={handleSeek}
          className="flex-1 h-2 bg-slate-800 hover:bg-slate-700 rounded-full cursor-pointer relative overflow-hidden group transition-colors"
          title="Click to seek playback position"
        >
          <div
            className="h-full bg-gradient-to-r from-amber-500 to-orange-400 rounded-full transition-all duration-75 relative"
            style={{ width: `${progressPercent}%` }}
          >
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-md scale-0 group-hover:scale-100 transition-transform" />
          </div>
        </div>
        <span className="font-mono text-xs text-slate-500 w-11">
          {formatTime(endTimeMs)}
        </span>
      </div>

      {/* Main Score & Optional Side-by-Side Comparison Container */}
      <div className="relative flex-1 bg-slate-950/40 p-3 md:p-6">
        {isRenderLoading && (
          <div className="absolute inset-0 z-20 bg-slate-950/70 backdrop-blur-sm flex flex-col items-center justify-center gap-3 min-h-[460px]">
            <div className="w-10 h-10 border-3 border-amber-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm font-semibold text-slate-200">
              Rendering Tablature & Multi-System Notation...
            </p>
          </div>
        )}

        {isTruncated && (
          <div className="mb-4 p-3.5 rounded-xl bg-amber-500/15 border border-amber-500/35 flex items-start gap-2.5 text-xs text-amber-200">
            <AlertCircle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-amber-300">Transcription Token Warning (MAX_TOKENS)</p>
              <p>The AI transcription reached the output token limit while transcribing this score. Some measures at the bottom of the page may be incomplete.</p>
            </div>
          </div>
        )}

        {renderError && (
          <div className="mb-4 p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 flex items-start gap-2.5 text-xs text-red-300">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-red-200">Renderer Notice</p>
              <p>{renderError}</p>
            </div>
          </div>
        )}

        <div className={`grid gap-4 ${showSideBySide && originalImagePreview ? 'grid-cols-1 lg:grid-cols-12' : 'grid-cols-1'}`}>
          {/* Original Photo Preview Pane when comparing */}
          {showSideBySide && originalImagePreview && (
            <div className="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-xl p-3 flex flex-col lg:sticky lg:top-20 max-h-[85vh]">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800 text-xs font-semibold text-slate-300">
                <span>Original Sheet Music Photo</span>
                <button
                  onClick={() => setShowSideBySide(false)}
                  className="text-slate-400 hover:text-white cursor-pointer"
                >
                  ✕
                </button>
              </div>
              <div className="flex-1 overflow-auto rounded-lg bg-slate-950 flex items-center justify-center p-2">
                <img
                  src={originalImagePreview}
                  alt="Original Sheet Music"
                  className="max-h-[75vh] w-auto object-contain rounded-lg"
                />
              </div>
            </div>
          )}

          {/* alphaTab Rendering Paper Viewport - unclipped height: auto so multi-system scores expand vertically */}
          <div className={`${showSideBySide && originalImagePreview ? 'lg:col-span-8' : 'w-full'} flex flex-col`}>
            {/* The crisp white/parchment score paper container for authentic multi-line notation */}
            <div
              className="w-full bg-white text-slate-900 rounded-xl shadow-inner border border-slate-300 p-4 md:p-8 relative transition-all"
              style={{
                boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.08), 0 10px 30px rgba(0,0,0,0.25)',
                width: '100%',
                height: 'auto',
                minHeight: '460px',
              }}
            >
              {/* AlphaTab Mount Node with full width and auto height */}
              <div
                ref={containerRef}
                className="w-full"
                style={{ width: '100%', height: 'auto' }}
              />
            </div>

            {/* Hint footer */}
            <div className="mt-2.5 flex flex-wrap items-center justify-between text-[11px] text-slate-500 px-1">
              <span>Click on any measure or note to seek playback • Spacebar to Play/Pause</span>
              <span>Audio powered by Sonivox SoundFont & alphaTab Synthesizer</span>
            </div>
          </div>
        </div>
      </div>

      {/* MusicXML Inspector & Live Editor Modal */}
      {showXmlModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Code className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-slate-100">MusicXML 3.1 Code Inspector</h3>
              </div>
              <button
                onClick={() => setShowXmlModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-4 flex-1 flex flex-col overflow-hidden">
              <p className="text-xs text-slate-400 mb-2">
                You can review or edit the raw MusicXML 3.1 transcribed by Gemini Vision or loaded from sample presets. Click 'Apply & Re-render' to test changes immediately.
              </p>
              <textarea
                value={editableXml}
                onChange={(e) => setEditableXml(e.target.value)}
                className="w-full flex-1 bg-slate-950 text-amber-300 font-mono text-xs p-4 rounded-xl border border-slate-800 focus:outline-none focus:border-amber-500 resize-none overflow-auto"
                rows={18}
                spellCheck={false}
              />
            </div>

            <div className="px-6 py-3.5 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(editableXml);
                  setCopiedXml(true);
                  setTimeout(() => setCopiedXml(false), 2000);
                }}
                className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-all cursor-pointer"
              >
                {copiedXml ? 'Copied to Clipboard!' : 'Copy to Clipboard'}
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowXmlModal(false)}
                  className="px-3.5 py-1.5 rounded-xl text-slate-400 hover:text-slate-200 text-xs font-semibold cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={handleApplyEditedXml}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition-all shadow-md shadow-amber-500/20 cursor-pointer"
                >
                  Apply & Re-render
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
