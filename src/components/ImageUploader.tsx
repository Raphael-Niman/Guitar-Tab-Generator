import React, { useState, useRef } from 'react';
import {
  Upload,
  Camera,
  Image as ImageIcon,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  FileMusic,
  Maximize2,
  X,
  Zap,
  RefreshCw,
} from 'lucide-react';
import { compressSheetMusicImage, formatBytes, CompressedImageResult } from '../utils/imageCompressor';

interface ImageUploaderProps {
  onTranscribe: (compressed: CompressedImageResult) => Promise<void>;
  isTranscribing: boolean;
  transcriptionStep: string;
}

export const ImageUploader: React.FC<ImageUploaderProps> = ({
  onTranscribe,
  isTranscribing,
  transcriptionStep,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [compressedImage, setCompressedImage] = useState<CompressedImageResult | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPreviewZoomed, setIsPreviewZoomed] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Please select a valid image file (JPEG, PNG, HEIC, WebP).');
      return;
    }

    try {
      setError(null);
      setIsCompressing(true);
      const result = await compressSheetMusicImage(file);
      setCompressedImage(result);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Failed to process and compress image.');
    } finally {
      setIsCompressing(false);
    }
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleStartTranscribe = async () => {
    if (!compressedImage) return;
    setError(null);
    try {
      await onTranscribe(compressedImage);
    } catch (err: any) {
      setError(err?.message || 'Transcription failed. Please try another image.');
    }
  };

  const handleClearImage = () => {
    setCompressedImage(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  };

  return (
    <div className="w-full bg-slate-900/90 border border-slate-800 rounded-2xl p-5 md:p-7 shadow-xl backdrop-blur-md">
      {/* Hidden inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.[0]) handleFile(e.target.files[0]);
        }}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.[0]) handleFile(e.target.files[0]);
        }}
      />

      {!compressedImage ? (
        <div>
          {/* Drag & Drop Zone */}
          <div
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onClick={() => fileInputRef.current?.click()}
            className={`cursor-pointer group relative border-2 border-dashed rounded-xl p-8 md:p-10 transition-all flex flex-col items-center justify-center text-center ${
              isDragging
                ? 'border-amber-400 bg-amber-500/10 scale-[1.01]'
                : 'border-slate-700 hover:border-amber-500/70 hover:bg-slate-800/60 bg-slate-950/40'
            }`}
          >
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-amber-500/20 to-orange-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-4 group-hover:scale-110 transition-transform shadow-lg shadow-amber-500/10">
              <FileMusic className="w-8 h-8" />
            </div>

            <h3 className="text-lg md:text-xl font-bold text-slate-100 mb-1">
              Upload Sheet Music Photo
            </h3>
            <p className="text-sm text-slate-400 max-w-md mb-5">
              Drag & drop photos of guitar sheet music or standard notation here. Full-page high resolution (up to 3072px) captures every row and system.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm transition-all shadow-md shadow-amber-500/20 active:scale-95"
              >
                <Upload className="w-4 h-4" />
                Browse Photo
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  cameraInputRef.current?.click();
                }}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold text-sm transition-all shadow-md active:scale-95"
              >
                <Camera className="w-4 h-4 text-amber-400" />
                Camera Snap
              </button>
            </div>

            <div className="mt-4 flex items-center gap-4 text-xs text-slate-500">
              <span>Supports JPG, PNG, WebP, HEIC</span>
              <span>•</span>
              <span>Auto-converts to 6-string tab & audio</span>
            </div>
          </div>
        </div>
      ) : (
        /* Image Preview & Optimization Confirmation */
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-slate-200">
                  Sheet Music Photo Ready
                </h4>
                <p className="text-xs text-slate-400">
                  {compressedImage.fileName} • {compressedImage.compressedWidth} × {compressedImage.compressedHeight}px
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto">
              <button
                type="button"
                disabled={isTranscribing}
                onClick={handleClearImage}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                Choose Different Photo
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center">
            {/* Thumbnail */}
            <div className="md:col-span-4 relative group rounded-xl overflow-hidden border border-slate-700 bg-slate-950 aspect-[4/3] max-h-56 flex items-center justify-center">
              <img
                src={compressedImage.dataUrl}
                alt="Uploaded Sheet Music Preview"
                className="w-full h-full object-contain"
              />
              <button
                type="button"
                onClick={() => setIsPreviewZoomed(true)}
                title="Expand Preview"
                className="absolute bottom-2 right-2 p-2 rounded-lg bg-slate-900/80 hover:bg-slate-900 text-slate-200 border border-slate-700 backdrop-blur-sm opacity-90 group-hover:opacity-100 transition-opacity"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
            </div>

            {/* Compression stats & Action */}
            <div className="md:col-span-8 flex flex-col justify-between space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
                  <span className="text-slate-500 block">Original Size</span>
                  <span className="text-slate-300 font-semibold">
                    {formatBytes(compressedImage.originalSize)} ({compressedImage.originalWidth}×{compressedImage.originalHeight})
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
                  <span className="text-slate-500 block">Browser Resized</span>
                  <span className="text-emerald-400 font-semibold">
                    {formatBytes(compressedImage.compressedSize)} (max 3072px)
                  </span>
                </div>
                <div className="col-span-2 sm:col-span-1 p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center gap-1.5">
                  <Zap className="w-4 h-4 text-amber-400" />
                  <div>
                    <span className="text-slate-500 block">Client Optimized</span>
                    <span className="text-amber-400 font-semibold">
                      {Math.round(
                        ((compressedImage.originalSize - compressedImage.compressedSize) /
                          Math.max(compressedImage.originalSize, 1)) *
                          100
                      )}% Reduced
                    </span>
                  </div>
                </div>
              </div>

              {/* Transcription Status or Action */}
              {isTranscribing ? (
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-amber-300 flex items-center gap-2">
                      <Sparkles className="w-4 h-4 animate-spin text-amber-400" />
                      {transcriptionStep || 'Gemini Vision Optical Music Recognition in progress...'}
                    </span>
                    <span className="text-slate-400">Please wait</span>
                  </div>
                  {/* Progress animation bar */}
                  <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-amber-500 via-orange-500 to-amber-400 rounded-full animate-pulse w-3/4" />
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Transcribing clefs, key signatures, rhythms, chords, and converting to 6-string guitar tablature...
                  </p>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={handleStartTranscribe}
                    className="flex-1 inline-flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 hover:from-amber-400 hover:via-orange-400 hover:to-amber-500 text-slate-950 font-bold text-sm shadow-lg shadow-amber-500/25 active:scale-[0.99] transition-all cursor-pointer"
                  >
                    <Sparkles className="w-4 h-4 fill-slate-950" />
                    Convert Photo into Guitar Tablature
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Error alert */}
      {error && (
        <div className="mt-4 p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-between gap-2.5 text-xs text-red-300">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
            <div>
              <p className="font-semibold text-red-200">Transcription Notice</p>
              <p>{error}</p>
            </div>
          </div>
          {compressedImage && !isTranscribing && (
            <button
              type="button"
              onClick={handleStartTranscribe}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-all shadow-sm active:scale-95 cursor-pointer shrink-0"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry</span>
            </button>
          )}
        </div>
      )}

      {/* Modal Zoomed View */}
      {isPreviewZoomed && compressedImage && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setIsPreviewZoomed(false)}
        >
          <div
            className="relative max-w-4xl max-h-[90vh] bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl p-2"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setIsPreviewZoomed(false)}
              className="absolute top-4 right-4 z-10 p-2 rounded-full bg-slate-950/80 hover:bg-slate-800 text-white border border-slate-700"
            >
              <X className="w-5 h-5" />
            </button>
            <img
              src={compressedImage.dataUrl}
              alt="Zoomed Sheet Music"
              className="max-h-[85vh] w-auto mx-auto object-contain rounded-xl"
            />
          </div>
        </div>
      )}
    </div>
  );
};
