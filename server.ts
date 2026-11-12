import express from 'express';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Generous body limit for high-resolution resized images (base64)
app.use(express.json({ limit: '30mb' }));
app.use(express.urlencoded({ extended: true, limit: '30mb' }));

/**
 * Returns an initialized GoogleGenAI client with the current runtime API key
 */
function getAiClient(): GoogleGenAI {
  const currentKey = process.env.GEMINI_API_KEY || '';
  return new GoogleGenAI({
    apiKey: currentKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// Health check endpoint
app.get('/api/health', (_req, res) => {
  const currentKey = process.env.GEMINI_API_KEY || '';
  res.json({
    status: 'ok',
    hasApiKey: Boolean(currentKey && currentKey !== 'MY_GEMINI_API_KEY'),
    timestamp: new Date().toISOString(),
  });
});

interface ModelCandidate {
  model: string;
  thinkingLevel?: ThinkingLevel;
  temperature?: number;
  maxAttempts: number;
  openTimeoutMs: number;
}

interface TranscriptionResult {
  text: string;
  modelUsed: string;
  finishReason?: string;
  isTruncated: boolean;
}

interface TranscriptionJob {
  id: string;
  status: 'processing' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  progressStep: string;
  measuresSoFar: number;
  modelUsed?: string;
  musicXml?: string;
  measureCount?: number;
  finishReason?: string;
  isTruncated?: boolean;
  error?: string;
}

const transcriptionJobs = new Map<string, TranscriptionJob>();
const JOB_TTL_MS = 15 * 60 * 1000; // 15 minutes

function cleanupExpiredJobs(): void {
  const now = Date.now();
  for (const [id, job] of transcriptionJobs.entries()) {
    if (now - job.updatedAt > JOB_TTL_MS) {
      transcriptionJobs.delete(id);
    }
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`STREAM_TIMEOUT: ${label} exceeded ${Math.round(ms / 1000)}s`));
    }, ms);
    promise.then(
      (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

/**
 * Calls Gemini Vision via generateContentStream starting with gemini-4-argon
 * (ThinkingLevel.HIGH, includeThoughts: true, temperature: 0.1, maxOutputTokens: 65536).
 * Enabling includeThoughts streams live reasoning heartbeats within seconds so dense
 * multi-system pages never stall silently, while filtering thought parts out of the XML output.
 */
async function generateMusicXmlWithFallback(
  ai: GoogleGenAI,
  imagePart: { inlineData: { mimeType: string; data: string } },
  textPart: { text: string },
  systemInstruction: string,
  onProgress?: (info: { step: string; measuresSoFar: number; model: string }) => void
): Promise<TranscriptionResult> {
  const candidates: ModelCandidate[] = [
    {
      model: 'gemini-4-argon',
      thinkingLevel: ThinkingLevel.HIGH,
      temperature: 0.1,
      maxAttempts: 2,
      openTimeoutMs: 90_000,
    },
    {
      model: 'gemini-4-argon',
      thinkingLevel: ThinkingLevel.MEDIUM,
      temperature: 0.1,
      maxAttempts: 1,
      openTimeoutMs: 60_000,
    },
    {
      model: 'gemini-3.8-flash',
      thinkingLevel: ThinkingLevel.MEDIUM,
      maxAttempts: 2,
      openTimeoutMs: 45_000,
    },
    {
      model: 'gemini-3.1-flash-lite',
      maxAttempts: 2,
      openTimeoutMs: 35_000,
    },
  ];

  let lastError: any = null;

  for (const { model, thinkingLevel, temperature, maxAttempts, openTimeoutMs } of candidates) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const attemptStartedAt = Date.now();
      let accumulatedText = '';
      let finishReason: string | undefined;

      try {
        const levelLabel = thinkingLevel ? `, thinkingLevel=${thinkingLevel}` : '';
        console.log(
          `[OMR] Transcribing score with ${model} (attempt ${attempt}/${maxAttempts}${levelLabel})...`
        );

        onProgress?.({
          step: thinkingLevel
            ? `Inspecting ledger lines, polyphonic voices & ties (${model})...`
            : `Transcribing sheet music staves & voices (${model})...`,
          measuresSoFar: 0,
          model,
        });

        const stream = await withTimeout(
          ai.models.generateContentStream({
            model,
            contents: { parts: [imagePart, textPart] },
            config: {
              systemInstruction,
              maxOutputTokens: 65536,
              ...(typeof temperature === 'number' ? { temperature } : {}),
              ...(thinkingLevel
                ? { thinkingConfig: { thinkingLevel, includeThoughts: true } }
                : {}),
            },
          }),
          openTimeoutMs,
          `${model} stream open`
        );

        let thoughtUpdates = 0;
        const iterator = stream[Symbol.asyncIterator]();

        while (true) {
          const next = await withTimeout(
            iterator.next(),
            75_000,
            `${model} chunk stream`
          );
          if (next.done) break;

          const chunk = next.value;
          const parts = chunk?.candidates?.[0]?.content?.parts;
          let addedXmlPiece = false;

          if (Array.isArray(parts) && parts.length > 0) {
            for (const part of parts) {
              if ((part as any).thought) {
                thoughtUpdates++;
                onProgress?.({
                  step: `Verifying ledger lines, voice stems & bar durations (${model})...`,
                  measuresSoFar: 0,
                  model,
                });
              } else if (typeof part.text === 'string' && part.text.length > 0) {
                accumulatedText += part.text;
                addedXmlPiece = true;
              }
            }
          } else if (chunk?.text) {
            accumulatedText += chunk.text;
            addedXmlPiece = true;
          }

          if (addedXmlPiece) {
            const measureMatches = accumulatedText.match(/<measure(?:\s+[^>]*)?>/gi);
            const measuresSoFar = measureMatches ? measureMatches.length : 0;
            onProgress?.({
              step:
                measuresSoFar > 0
                  ? `Streaming polyphonic MusicXML (${measuresSoFar} ${
                      measuresSoFar === 1 ? 'measure' : 'measures'
                    } transcribed)...`
                  : `Generating MusicXML header & guitar tuning (${model})...`,
              measuresSoFar,
              model,
            });
          } else if (thoughtUpdates === 0) {
            onProgress?.({
              step: `Analyzing staves, key signature & voices (${model})...`,
              measuresSoFar: 0,
              model,
            });
          }

          const candFinish = chunk?.candidates?.[0]?.finishReason;
          if (candFinish) {
            finishReason = candFinish;
          }
        }

        const isTruncated = finishReason === 'MAX_TOKENS';
        if (isTruncated) {
          console.log(`[OMR] Notice: Response reached MAX_TOKENS limit on ${model}.`);
        }

        if (accumulatedText.trim().length > 0) {
          console.log(
            `[OMR] Completed transcription with ${model} in ${Math.round(
              (Date.now() - attemptStartedAt) / 1000
            )}s (finishReason: ${finishReason || 'STOP'}, chars: ${accumulatedText.length})`
          );
          return { text: accumulatedText, modelUsed: model, finishReason, isTruncated };
        }
      } catch (err: any) {
        const status = err?.status || err?.code || '';
        const errorMsg = String(err?.message || err);
        const elapsedMs = Date.now() - attemptStartedAt;
        lastError = err;

        // If stream stalled near the very end after already transcribing multiple complete measures, salvage them!
        const completedMeasures = (accumulatedText.match(/<\/measure>/gi) || []).length;
        if (accumulatedText.includes('<score-partwise') && completedMeasures >= 4) {
          console.log(
            `[OMR] Salvaging ${completedMeasures} completed measures from interrupted ${model} stream.`
          );
          return {
            text: accumulatedText,
            modelUsed: model,
            finishReason: 'MAX_TOKENS',
            isTruncated: true,
          };
        }

        const isTimeout = errorMsg.includes('STREAM_TIMEOUT') || errorMsg.includes('DEADLINE_EXCEEDED');
        const isFastDemandSpike =
          !isTimeout &&
          elapsedMs < 15_000 &&
          (status === 503 ||
            status === 504 ||
            errorMsg.includes('503') ||
            errorMsg.includes('high demand') ||
            errorMsg.includes('UNAVAILABLE'));

        console.log(
          `[OMR] ${model} attempt ${attempt} incomplete after ${Math.round(elapsedMs / 1000)}s (${
            isTimeout ? 'timeout' : isFastDemandSpike ? '503 demand spike' : status || 'unavailable'
          }) — ${
            isFastDemandSpike && attempt < maxAttempts
              ? 'retrying after short backoff'
              : 'advancing to faster model configuration'
          }.`
        );

        // Only retry the SAME candidate on fast 503 spikes; on timeouts immediately step down to the faster config
        if (isFastDemandSpike && attempt < maxAttempts) {
          const backoffMs = 1200 * Math.pow(1.6, attempt - 1) + Math.floor(Math.random() * 350);
          await new Promise((r) => setTimeout(r, backoffMs));
        } else {
          break;
        }
      }
    }
  }

  throw (
    lastError ||
    new Error('All available AI transcription models are currently busy. Please retry in a few moments.')
  );
}

/**
 * Cleans and validates generated MusicXML 3.1, salvaging complete measures if truncated at MAX_TOKENS.
 */
function sanitizeAndValidateGeneratedXml(
  generatedText: string,
  isTruncated: boolean
): { ok: true; xml: string; measureCount: number } | { ok: false; error: string; rawPreview: string } {
  let rawXml = (generatedText || '').trim();

  // Strip markdown code blocks if included
  if (rawXml.startsWith('```')) {
    rawXml = rawXml.replace(/^```(?:xml|musicxml)?\s*/i, '');
    rawXml = rawXml.replace(/\s*```$/, '');
    rawXml = rawXml.trim();
  }

  // Strip DOCTYPE if generated
  rawXml = rawXml.replace(/<!DOCTYPE[^>]*>/gi, '').trim();

  const startIdx = rawXml.indexOf('<score-partwise');
  if (startIdx === -1) {
    return {
      ok: false,
      error:
        'The AI model could not identify readable musical notation in this image. Please provide a clear, well-lit photo of guitar sheet music.',
      rawPreview: rawXml.slice(0, 500),
    };
  }

  const endIdx = rawXml.lastIndexOf('</score-partwise>');
  if (endIdx !== -1) {
    const xmlPrefix = rawXml.startsWith('<?xml') ? '' : '<?xml version="1.0" encoding="UTF-8"?>\n';
    rawXml = rawXml.startsWith('<?xml')
      ? rawXml.substring(0, endIdx + '</score-partwise>'.length)
      : xmlPrefix + rawXml.substring(startIdx, endIdx + '</score-partwise>'.length);
  } else if (isTruncated || rawXml.includes('</measure>')) {
    // Salvage all completed measures if cut off before closing </score-partwise>
    const lastMeasureClose = rawXml.lastIndexOf('</measure>');
    if (lastMeasureClose !== -1) {
      const prefix = rawXml.startsWith('<?xml')
        ? rawXml.substring(0, lastMeasureClose + '</measure>'.length)
        : '<?xml version="1.0" encoding="UTF-8"?>\n' +
          rawXml.substring(startIdx, lastMeasureClose + '</measure>'.length);
      rawXml = `${prefix}\n  </part>\n</score-partwise>`;
    } else {
      return {
        ok: false,
        error:
          'The transcription ended before completing a full measure. Please retry with a clearer photo.',
        rawPreview: rawXml.slice(0, 500),
      };
    }
  } else {
    return {
      ok: false,
      error:
        'The AI model could not identify readable musical notation in this image. Please provide a clear, well-lit photo of guitar sheet music.',
      rawPreview: rawXml.slice(0, 500),
    };
  }

  const measureMatches = rawXml.match(/<measure(?:\s+[^>]*)?>/gi);
  const measureCount = measureMatches ? measureMatches.length : 0;

  return { ok: true, xml: rawXml, measureCount };
}

function buildOmrPrompts(safeTitle: string): { systemInstruction: string; promptText: string } {
  const systemInstruction = `You are an elite classical & fingerstyle guitar Optical Music Recognition (OMR) engine and MusicXML 3.1 engraver.
Carefully inspect every system, measure, ledger line, accidental, tie, dot, barline, and stem direction before outputting MusicXML 3.1.

CONCISE INTERNAL REASONING RULE (CRITICAL FOR DENSE PAGES):
- Keep your internal thinking ultra-compact and telegraphic (e.g., "M1: V1[E5q D5q C5h] V2[A3h E3h]; M2: ..."). Do NOT write lengthy English prose per note so dense multi-system pages finish rapidly.

STRICT MULTI-SYSTEM & FULL-PAGE RULES:
1. Scan the entire image sequentially from the top-left of the first staff system all the way to the final bar of the bottom staff system. Do NOT stop after the first line or first few measures.
2. Count the total number of musical systems (rows) and measures visible in the image first, and transcribe every single measure in exact order inside a single continuous <part id="P1">.
3. Do not truncate, summarize, or use ellipsis/comments like <!-- remaining measures -->. Output every note of every measure in full valid MusicXML 3.1.

STRICT POLYPHONIC MULTI-VOICE GUITAR RULES (MELODY + BASS TOGETHER):
1. Separate Up-Stem and Down-Stem Voices:
   - Classical and fingerstyle guitar scores contain two simultaneous voices on the same staff:
     * Voice 1 (<voice>1</voice>, <stem>up</stem>): upper melody / treble notes with stems pointing UP.
     * Voice 2 (<voice>2</voice>, <stem>down</stem>): lower bass / accompaniment notes with stems pointing DOWN.
   - You MUST transcribe BOTH voices completely in every polyphonic measure—NEVER drop bass notes and NEVER drop high melody notes.
2. Use <backup> Between Voices:
   - Inside each <measure>, write all notes and rests for <voice>1</voice> first (summing to the exact measure duration).
   - Then insert <backup><duration>MEASURE_DURATION</duration></backup> equal to the exact duration elapsed in Voice 1 for that measure.
   - Then write all notes and rests for <voice>2</voice> (also summing to the exact measure duration) so both voices align and sound simultaneously.
   - If two or more notes within the SAME voice share a single stem, write the first note normally and put <chord/> immediately before <pitch> on the simultaneous stem-mates with the same <voice> and <duration>.
3. Exact Pitch & Octave Reading (Standard Written Guitar Treble Clef):
   - Read every ledger line below and above the treble staff with extreme precision!
   - Remember standard written guitar treble clef pitch positions (written 1 octave above concert pitch):
     * Below the staff: D4 = space just below line 1; C4 (written middle C) = ON the 1st ledger line below; B3 = below 1st ledger line; A3 = ON the 2nd ledger line below; G3 = below 2nd ledger line; F3 = ON the 3rd ledger line below; E3 (open 6th string) = just below the 3rd ledger line below the staff.
     * On the staff (bottom to top): E4 (line 1), F4 (space 1), G4 (line 2), A4 (space 2), B4 (line 3), C5 (space 3), D5 (line 4), E5 (space 4, open 1st string), F5 (line 5).
     * Above the staff: G5 = space just above line 5; A5 = ON the 1st ledger line above; B5 = above 1st ledger line; C6 = ON the 2nd ledger line above; D6 = above 2nd ledger line; E6 = ON the 3rd ledger line above.
   - Preserve EVERY sharp (<alter>1</alter>), flat (<alter>-1</alter>), natural (<alter>0</alter> with <accidental>natural</accidental>), key-signature accidental across the full measure, rhythm dot (<dot/>), and tied note (<tie type="start"/> / <tie type="stop"/> plus <notations><tied type="start|stop"/></notations>).
4. Exact Bar-for-Bar Structure:
   - Preserve pickup / anacrusis measures (<measure number="0" implicit="yes">) with their exact short duration (do NOT pad pickup measures with extra rests).
   - Preserve exact measure boundaries, repeat barlines (<barline location="left"><repeat direction="forward"/></barline> and <barline location="right"><repeat direction="backward"/></barline>), and 1st/2nd endings (<barline location="left"><ending number="1" type="start"/></barline>, <barline location="right"><ending number="1" type="stop"/><repeat direction="backward"/></barline>, <barline location="left"><ending number="2" type="start"/></barline>, <barline location="right"><ending number="2" type="discontinue"/></barline>) in the exact order shown in the score.

COMPACT XML OUTPUT FORMAT (CRITICAL FOR SPEED):
- Format each <note>...</note>, <backup>...</backup>, and <staff-tuning>...</staff-tuning> compactly on a SINGLE line with NO leading indentation spaces (e.g. <note><pitch><step>E</step><octave>5</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><stem>up</stem></note>).
- Return ONLY raw valid MusicXML 3.1 starting with <?xml version="1.0" encoding="UTF-8"?> and ending with </score-partwise>.
- NO markdown code fences (\`\`\`xml) and NO <!DOCTYPE> declarations.`;

  const promptText = `Transcribe this complete guitar sheet music image into valid polyphonic MusicXML 3.1 (<score-partwise version="3.1">).

CHECKLIST BEFORE GENERATING XML:
1. Header & First Measure Attributes:
   - <work><work-title>${safeTitle}</work-title></work>
   - Single part <score-part id="P1"><part-name>Classical Guitar</part-name></score-part> (MIDI program 25).
   - In the very first measure's <attributes>, set:
     * <divisions>4</divisions> (or 12 if triplets appear: quarter=12, eighth-triplet=4, eighth=6, sixteenth=3).
     * <key><fifths>...</fifths></key> and <time><beats>...</beats><beat-type>...</beat-type></time> matching the printed score.
     * <clef><sign>G</sign><line>2</line></clef> (do NOT put <clef-octave-change> inside <clef>; include <transpose> below).
     * <staff-details><staff-lines>6</staff-lines><staff-tuning line="1"><tuning-step>E</tuning-step><tuning-octave>2</tuning-octave></staff-tuning><staff-tuning line="2"><tuning-step>A</tuning-step><tuning-octave>2</tuning-octave></staff-tuning><staff-tuning line="3"><tuning-step>D</tuning-step><tuning-octave>3</tuning-octave></staff-tuning><staff-tuning line="4"><tuning-step>G</tuning-step><tuning-octave>3</tuning-octave></staff-tuning><staff-tuning line="5"><tuning-step>B</tuning-step><tuning-octave>3</tuning-octave></staff-tuning><staff-tuning line="6"><tuning-step>E</tuning-step><tuning-octave>4</tuning-octave></staff-tuning></staff-details>
     * <transpose><diatonic>0</diatonic><chromatic>0</chromatic><octave-change>-1</octave-change></transpose>
2. Polyphonic Voices & Rhythm Integrity:
   - Transcribe BOTH Voice 1 (up-stem melody) and Voice 2 (down-stem bass/accompaniment) using <voice>1</voice>, then <backup><duration>...</duration></backup>, then <voice>2</voice>.
   - Never omit low bass ledger-line notes (E3..C4) or high ledger-line melody notes (G5..E6).
   - Preserve pickup measures (<measure number="0" implicit="yes">), repeats, 1st/2nd endings, dots, accidentals, and ties (<tie type="start|stop"/>).
   - Do NOT include <technical><fret> tags. Write each <note>...</note> on a single compact line without indentation.
3. Keep internal reasoning brief and telegraphic, then output every measure from top to bottom as raw XML.`;

  return { systemInstruction, promptText };
}

function formatFriendlyTranscriptionError(error: any): { status: number; message: string } {
  const msg = String(error?.message || 'An error occurred while transcribing sheet music.');
  const isDemand =
    msg.includes('503') ||
    msg.includes('high demand') ||
    msg.includes('UNAVAILABLE') ||
    msg.includes('STREAM_TIMEOUT');
  const isQuota =
    msg.includes('429') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('PERMISSION_DENIED') ||
    msg.includes('403');

  if (isDemand) {
    return {
      status: 503,
      message:
        'The AI transcription service is experiencing temporary high demand across models. Please click Retry in a few seconds.',
    };
  }
  if (isQuota) {
    return {
      status: 429,
      message:
        'API quota or key permission reached for high-precision vision models. You can attach a billing-enabled API key in Settings > Secrets, or retry shortly.',
    };
  }
  return { status: 500, message: msg };
}

/**
 * Poll status for an active background transcription job (fast <5ms JSON response, immune to proxy timeouts)
 */
app.get('/api/transcribe/status/:jobId', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  const job = transcriptionJobs.get(req.params.jobId);

  if (!job) {
    return res.status(404).json({
      status: 'failed',
      success: false,
      error: 'Transcription session expired or server restarted. Please click Retry.',
    });
  }

  if (job.status === 'processing') {
    return res.status(200).json({
      status: 'processing',
      progressStep: job.progressStep,
      measuresSoFar: job.measuresSoFar,
      modelUsed: job.modelUsed,
      elapsedSeconds: Math.max(1, Math.round((Date.now() - job.createdAt) / 1000)),
    });
  }

  if (job.status === 'completed') {
    return res.status(200).json({
      status: 'completed',
      success: true,
      musicXml: job.musicXml,
      measureCount: job.measureCount,
      modelUsed: job.modelUsed,
      finishReason: job.finishReason,
      isTruncated: job.isTruncated,
      message: `Music transcribed successfully (${job.measureCount} measures via ${job.modelUsed}).`,
    });
  }

  return res.status(200).json({
    status: 'failed',
    success: false,
    error: job.error || 'Failed to transcribe sheet music.',
  });
});

/**
 * Transcribe sheet music photo to polyphonic MusicXML 3.1 using Gemini Vision.
 * Supports `async: true` background job mode (recommended for full-page scores so reverse
 * proxies never time out during deep reasoning) as well as direct synchronous mode.
 */
app.post('/api/transcribe', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const { imageBase64, mimeType = 'image/jpeg', title, async: useAsyncJob } = req.body || {};

    if (!imageBase64) {
      return res.status(400).json({
        error: 'Missing imageBase64 in request body.',
      });
    }

    const currentKey = process.env.GEMINI_API_KEY || '';
    if (!currentKey || currentKey === 'MY_GEMINI_API_KEY') {
      return res.status(500).json({
        error:
          'GEMINI_API_KEY is not configured on the server. Please check your AI Studio Secrets panel.',
      });
    }

    const cleanBase64 = String(imageBase64).replace(/^data:[a-zA-Z0-9/+-]+;base64,/, '');
    const safeTitle = title ? String(title).replace(/[<>&'"]/g, '') : 'Transcribed Guitar Score';
    const { systemInstruction, promptText } = buildOmrPrompts(safeTitle);

    const imagePart = {
      inlineData: {
        mimeType: mimeType || 'image/jpeg',
        data: cleanBase64,
      },
    };
    const textPart = { text: promptText };

    // Async background job mode: respond immediately in <20ms so long multi-system reasoning never hits HTTP gateway timeouts
    if (useAsyncJob) {
      cleanupExpiredJobs();
      const jobId = `omr_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      const job: TranscriptionJob = {
        id: jobId,
        status: 'processing',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        progressStep: 'Inspecting ledger lines, polyphonic voices & ties with Gemini Vision...',
        measuresSoFar: 0,
      };
      transcriptionJobs.set(jobId, job);

      // Fire background streaming worker
      (async () => {
        try {
          const ai = getAiClient();
          const { text: generatedText, modelUsed, finishReason, isTruncated } =
            await generateMusicXmlWithFallback(
              ai,
              imagePart,
              textPart,
              systemInstruction,
              ({ step, measuresSoFar, model }) => {
                job.progressStep = step;
                job.measuresSoFar = measuresSoFar;
                job.modelUsed = model;
                job.updatedAt = Date.now();
              }
            );

          const validated = sanitizeAndValidateGeneratedXml(generatedText, isTruncated);
          if (!validated.ok) {
            job.status = 'failed';
            job.error = validated.error;
            job.updatedAt = Date.now();
            return;
          }

          job.status = 'completed';
          job.musicXml = validated.xml;
          job.measureCount = validated.measureCount;
          job.modelUsed = modelUsed;
          job.finishReason = finishReason;
          job.isTruncated = isTruncated;
          job.updatedAt = Date.now();
        } catch (err: any) {
          console.error('Background sheet music transcription failed:', err?.message || err);
          const formatted = formatFriendlyTranscriptionError(err);
          job.status = 'failed';
          job.error = formatted.message;
          job.updatedAt = Date.now();
        }
      })();

      return res.status(200).json({
        success: true,
        async: true,
        jobId,
        status: 'processing',
      });
    }

    // Synchronous fallback mode
    const ai = getAiClient();
    const { text: generatedText, modelUsed, finishReason, isTruncated } =
      await generateMusicXmlWithFallback(ai, imagePart, textPart, systemInstruction);

    const validated = sanitizeAndValidateGeneratedXml(generatedText, isTruncated);
    if (!validated.ok) {
      return res.status(422).json({
        error: validated.error,
        rawResponse: validated.rawPreview,
      });
    }

    return res.json({
      success: true,
      musicXml: validated.xml,
      measureCount: validated.measureCount,
      modelUsed,
      finishReason,
      isTruncated,
      message: `Music transcribed successfully (${validated.measureCount} measures via ${modelUsed}).`,
    });
  } catch (error: any) {
    console.error('Sheet music transcription failed:', error?.message || error);
    const formatted = formatFriendlyTranscriptionError(error);
    return res.status(formatted.status).json({
      error: formatted.message,
    });
  }
});

// Setup Vite middleware in dev or static files in production
async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  // Global error handler ensuring JSON responses for all unhandled API errors
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('Express uncaught error:', err);
    res.status(err?.status || 500).json({
      error: err?.message || 'Internal server error',
    });
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`GuitarTabGenerator server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
