/**
 * Deterministic Polyphonic Guitar Tablature Ergonomic Fingering Post-Processor
 *
 * Enforces realistic 6-string guitar frets and strings in standard tuning across all voices:
 * 1. Defines standard guitar tuning in <staff-details> (lines 1 to 6 = E2, A2, D3, G3, B3, E4)
 *    and <transpose><octave-change>-1</octave-change></transpose> for standard 8vb guitar display.
 * 2. Transposes written guitar treble clef down 1 octave (12 semitones) to sounding pitch.
 * 3. Tracks exact measure beat offsets across <voice>1</voice>, <backup>, <forward>, and <voice>2</voice>.
 * 4. Processes each <voice> independently for hand-position continuity and tied notes.
 * 5. Solves simultaneous attacks at the exact same beat offset (across Voice 1, Voice 2, and <chord/>)
 *    so no two simultaneous notes ever share the same guitar string and fretted spans remain playable.
 */

export interface GuitarStringSpec {
  stringNum: number; // 1 = High E (top), 6 = Low E (bottom)
  openPitch: number; // MIDI pitch of open string
  line: number;      // MusicXML staff line (1 = bottom, 6 = top)
  step: string;
  octave: number;
}

/**
 * Standard 6-string guitar tuning:
 * String 1 (top): High E (E4 = MIDI 64) -> Staff line 6
 * String 2: B (B3 = MIDI 59)            -> Staff line 5
 * String 3: G (G3 = MIDI 55)            -> Staff line 4
 * String 4: D (D3 = MIDI 50)            -> Staff line 3
 * String 5: A (A2 = MIDI 45)            -> Staff line 2
 * String 6 (bottom): Low E (E2 = MIDI 40) -> Staff line 1
 */
export const GUITAR_STRINGS: GuitarStringSpec[] = [
  { stringNum: 1, openPitch: 64, line: 6, step: 'E', octave: 4 },
  { stringNum: 2, openPitch: 59, line: 5, step: 'B', octave: 3 },
  { stringNum: 3, openPitch: 55, line: 4, step: 'G', octave: 3 },
  { stringNum: 4, openPitch: 50, line: 3, step: 'D', octave: 3 },
  { stringNum: 5, openPitch: 45, line: 2, step: 'A', octave: 2 },
  { stringNum: 6, openPitch: 40, line: 1, step: 'E', octave: 2 },
];

const STEP_SEMITONES: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

/**
 * Calculate MIDI note number from MusicXML pitch elements.
 * Example: C4 -> (4 + 1) * 12 + 0 = 60
 */
export function getMidiFromPitch(step: string, octave: number, alter = 0): number {
  const stepVal = STEP_SEMITONES[step.toUpperCase()] ?? 0;
  return (octave + 1) * 12 + stepVal + alter;
}

/**
 * Direct child query helper (avoids nested matches if needed)
 */
function getDirectChild(parent: Element, tagName: string): Element | null {
  for (let i = 0; i < parent.children.length; i++) {
    if (parent.children[i].tagName === tagName) {
      return parent.children[i];
    }
  }
  return null;
}

/**
 * Ensures standard 6-string guitar tuning and octave transposition are defined in <attributes>
 * of the first measure, and removes any conflicting <clef-octave-change> tags so alphaTab
 * renders standard notation at exact written treble-clef ledger positions while sounding 8vb.
 */
export function ensureStaffDetailsInXml(doc: Document): void {
  // Remove <clef-octave-change> from any <clef> so <transpose> cleanly controls 8vb display/playback
  doc.querySelectorAll('clef > clef-octave-change').forEach((el) => el.remove());

  const firstMeasure = doc.querySelector('measure');
  if (!firstMeasure) return;

  let attributes = getDirectChild(firstMeasure, 'attributes');
  if (!attributes) {
    attributes = doc.createElement('attributes');
    firstMeasure.insertBefore(attributes, firstMeasure.firstChild);
  }

  // Remove existing staff-details and transpose to insert canonical definitions in valid MusicXML order
  attributes.querySelectorAll('staff-details, transpose').forEach((el) => el.remove());

  const staffDetails = doc.createElement('staff-details');
  const staffLines = doc.createElement('staff-lines');
  staffLines.textContent = '6';
  staffDetails.appendChild(staffLines);

  // Exact MusicXML line order: line 1 = bottom (E2) to line 6 = top (E4)
  const tuningOrder = [
    { line: '1', step: 'E', octave: '2' },
    { line: '2', step: 'A', octave: '2' },
    { line: '3', step: 'D', octave: '3' },
    { line: '4', step: 'G', octave: '3' },
    { line: '5', step: 'B', octave: '3' },
    { line: '6', step: 'E', octave: '4' },
  ];

  for (const t of tuningOrder) {
    const tuning = doc.createElement('staff-tuning');
    tuning.setAttribute('line', t.line);

    const stepEl = doc.createElement('tuning-step');
    stepEl.textContent = t.step;
    tuning.appendChild(stepEl);

    const octEl = doc.createElement('tuning-octave');
    octEl.textContent = t.octave;
    tuning.appendChild(octEl);

    staffDetails.appendChild(tuning);
  }

  // Standard guitar transposition: sounds 1 octave below written treble clef
  const transposeEl = doc.createElement('transpose');
  const diatonicEl = doc.createElement('diatonic');
  diatonicEl.textContent = '0';
  const chromaticEl = doc.createElement('chromatic');
  chromaticEl.textContent = '0';
  const octaveChangeEl = doc.createElement('octave-change');
  octaveChangeEl.textContent = '-1';
  transposeEl.appendChild(diatonicEl);
  transposeEl.appendChild(chromaticEl);
  transposeEl.appendChild(octaveChangeEl);

  attributes.appendChild(staffDetails);
  attributes.appendChild(transposeEl);
}

interface TimedNoteEvent {
  noteEl: Element;
  voiceId: string;
  attackOffset: number;
  duration: number;
  isGrace: boolean;
  soundingMidi: number;
  isTieStart: boolean;
  isTieStop: boolean;
}

interface StringFretOption {
  stringNum: number;
  fret: number;
  cost: number;
}

interface RingingNote {
  voiceId: string;
  endOffset: number;
  stringNum: number;
}

function hasTieOfType(noteEl: Element, type: 'start' | 'stop'): boolean {
  const ties = noteEl.querySelectorAll('tie, tied');
  for (let i = 0; i < ties.length; i++) {
    if (ties[i].getAttribute('type') === type) {
      return true;
    }
  }
  return false;
}

/**
 * Ensures <tie type="start|stop"/> on <note> has matching <notations><tied type="start|stop"/></notations>
 * so alphaTab renders tie curves accurately across voices.
 */
function syncTieNotations(doc: Document, noteEl: Element, notationsEl: Element): void {
  for (const tieType of ['start', 'stop'] as const) {
    if (hasTieOfType(noteEl, tieType)) {
      const existingTied = Array.from(notationsEl.querySelectorAll('tied')).some(
        (el) => el.getAttribute('type') === tieType
      );
      if (!existingTied) {
        const tiedEl = doc.createElement('tied');
        tiedEl.setAttribute('type', tieType);
        notationsEl.insertBefore(tiedEl, notationsEl.firstChild);
      }
    }
  }
}

/**
 * Computes candidate (string, fret) options for a single note within its voice context.
 */
function getNoteCandidates(
  note: TimedNoteEvent,
  voicePrevFret: number,
  isPolyphonicMeasure: boolean,
  tiedAssignment: { stringNum: number; fret: number } | undefined,
  ringingNotes: RingingNote[]
): StringFretOption[] {
  const options: StringFretOption[] = [];

  for (const { stringNum, openPitch } of GUITAR_STRINGS) {
    const fret = note.soundingMidi - openPitch;
    if (fret < 0 || fret > 22) continue;

    let cost = 0;

    // 1. Position ergonomics: favor open strings and frets 1..4
    if (fret === 0) {
      cost -= 30;
    } else if (fret >= 1 && fret <= 4) {
      cost -= 15;
    } else if (fret === 5) {
      cost -= 2;
    } else if (fret <= 12) {
      cost += (fret - 5) * 7;
    } else {
      cost += 49 + (fret - 12) * 12;
    }

    // 2. Independent per-voice hand stretch continuity
    if (fret > 0) {
      cost += Math.abs(fret - voicePrevFret) * 3.5;
    }

    // 3. Voice register separation in multi-voice measures:
    // Voice 1 (up-stem melody) naturally favors upper strings 1..4;
    // Voice 2+ (down-stem bass/accompaniment) naturally favors lower strings 4..6.
    if (isPolyphonicMeasure) {
      if (note.voiceId === '1') {
        cost += (stringNum - 1) * 0.8;
      } else {
        cost += (6 - stringNum) * 0.8;
      }
    } else {
      cost += (6 - stringNum) * 0.4;
    }

    // 4. Preserve ringing notes from other voices whenever another string is available
    const cutsRingingOtherVoice = ringingNotes.some(
      (r) => r.voiceId !== note.voiceId && r.stringNum === stringNum && r.endOffset > note.attackOffset
    );
    if (cutsRingingOtherVoice) {
      cost += 55;
    }

    // 5. Tied note continuity: strongly keep a tied note on the exact same string & fret
    if (tiedAssignment && tiedAssignment.stringNum === stringNum && tiedAssignment.fret === fret) {
      cost -= 120;
    }

    options.push({ stringNum, fret, cost });
  }

  // Fallback if pitch was out of standard guitar range (e.g., drop D / scordatura low note or ultra-high harmonic)
  if (options.length === 0) {
    if (note.soundingMidi < 40) {
      options.push({ stringNum: 6, fret: 0, cost: 0 });
    } else {
      const clampedFret = Math.min(24, Math.max(0, note.soundingMidi - 64));
      options.push({ stringNum: 1, fret: clampedFret, cost: clampedFret * 10 });
    }
  }

  options.sort((a, b) => a.cost - b.cost);
  return options;
}

/**
 * Jointly assigns (string, fret) across ALL notes attacking on the exact same beat offset
 * (across Voice 1, Voice 2, and <chord/> stem-mates) so no two simultaneous notes share
 * a guitar string and simultaneous fretted notes remain within a playable hand span.
 */
function solveSimultaneousBeatAssignment(
  notesAtBeat: TimedNoteEvent[],
  candidatesPerNote: StringFretOption[][]
): { stringNum: number; fret: number }[] {
  const count = notesAtBeat.length;
  if (count === 1) {
    const best = candidatesPerNote[0][0];
    return [{ stringNum: best.stringNum, fret: best.fret }];
  }

  // Order indices from most constrained (fewest candidate strings, e.g. low bass notes) to least constrained
  const orderedIndices = Array.from({ length: count }, (_, i) => i).sort(
    (a, b) => candidatesPerNote[a].length - candidatesPerNote[b].length
  );

  let bestTotalCost = Number.POSITIVE_INFINITY;
  let bestAssignment: { stringNum: number; fret: number }[] | null = null;

  const currentChoice = new Array<{ stringNum: number; fret: number }>(count);
  const usedStrings = new Set<number>();

  function search(stepIdx: number, runningCost: number, allowCollisionPenalty: boolean): void {
    if (runningCost >= bestTotalCost) return;

    if (stepIdx === count) {
      bestTotalCost = runningCost;
      bestAssignment = currentChoice.map((c) => ({ ...c }));
      return;
    }

    const noteIdx = orderedIndices[stepIdx];
    const options = candidatesPerNote[noteIdx];

    for (const opt of options) {
      const collides = usedStrings.has(opt.stringNum);
      if (collides && !allowCollisionPenalty) {
        continue;
      }

      let stepCost = opt.cost + (collides ? 10000 : 0);

      // Hand-span check against already chosen simultaneous fretted notes at this beat
      if (opt.fret > 0) {
        for (let prev = 0; prev < stepIdx; prev++) {
          const prevChosen = currentChoice[orderedIndices[prev]];
          if (prevChosen.fret > 0) {
            const fretSpan = Math.abs(opt.fret - prevChosen.fret);
            if (fretSpan > 3) {
              stepCost += (fretSpan - 3) * 14;
            }
          }
        }
      }

      const wasAdded = !collides;
      if (wasAdded) usedStrings.add(opt.stringNum);
      currentChoice[noteIdx] = { stringNum: opt.stringNum, fret: opt.fret };

      search(stepIdx + 1, runningCost + stepCost, allowCollisionPenalty);

      if (wasAdded) usedStrings.delete(opt.stringNum);
    }
  }

  // Pass 1: Strict zero-collision search across all simultaneous voices & chord tones
  search(0, 0, false);

  // Pass 2: Safe fallback ONLY if physically impossible on 6 strings (e.g., two simultaneous notes both < A2)
  if (!bestAssignment) {
    search(0, 0, true);
  }

  return (
    bestAssignment ||
    candidatesPerNote.map((opts) => ({ stringNum: opts[0].stringNum, fret: opts[0].fret }))
  );
}

/**
 * Detects whether an imported MusicXML file was encoded entirely in concert/sounding pitch
 * (e.g. low E written as E2 instead of standard guitar written E3).
 */
function isConcertPitchScore(doc: Document): boolean {
  const hadClef8vb = doc.querySelector('clef > clef-octave-change')?.textContent?.trim() === '-1';
  const hadTranspose = doc.querySelector('transpose > octave-change')?.textContent?.trim() === '-1';
  if (hadTranspose) return false;

  let minMidi = Infinity;
  let maxMidi = -Infinity;
  let pitchedCount = 0;

  doc.querySelectorAll('note > pitch').forEach((pitchEl) => {
    const step = pitchEl.querySelector('step')?.textContent?.trim() || 'C';
    const octave = parseInt(pitchEl.querySelector('octave')?.textContent?.trim() || '4', 10);
    const alter = parseInt(pitchEl.querySelector('alter')?.textContent?.trim() || '0', 10);
    const midi = getMidiFromPitch(step, octave, alter);
    minMidi = Math.min(minMidi, midi);
    maxMidi = Math.max(maxMidi, midi);
    pitchedCount++;
  });

  if (pitchedCount === 0) return false;
  if (hadClef8vb && minMidi < 52 && maxMidi <= 79) return true;
  return minMidi >= 38 && minMidi < 48 && maxMidi <= 74;
}

/**
 * Client-Side Polyphonic 'Smart Guitar Fingering' Pass Before Loading into alphaTab
 */
export function assignErgonomicGuitarTab(musicXml: string): string {
  if (!musicXml || typeof musicXml !== 'string') {
    return musicXml;
  }

  try {
    let raw = musicXml.trim();
    if (raw.startsWith('```')) {
      raw = raw.replace(/^```(?:xml|musicxml)?\s*/i, '');
      raw = raw.replace(/\s*```$/, '').trim();
    }

    raw = raw.replace(/<!DOCTYPE[^>]*>/gi, '').trim();

    const parser = new DOMParser();
    const doc = parser.parseFromString(raw, 'text/xml');

    const parserError = doc.querySelector('parsererror');
    if (parserError) {
      console.warn('DOMParser reported XML warning, attempting best-effort recovery:', parserError.textContent);
    }

    // Detect if source XML was already in sounding/concert pitch BEFORE stripping clef-octave-change
    const scoreWasConcertPitch = isConcertPitchScore(doc);

    // If source was concert pitch, normalize <pitch><octave> up by +1 so written treble clef + <transpose> align
    if (scoreWasConcertPitch) {
      doc.querySelectorAll('note > pitch > octave').forEach((octEl) => {
        const oct = parseInt(octEl.textContent?.trim() || '3', 10);
        octEl.textContent = String(oct + 1);
      });
    }

    // 1. Ensure canonical <staff-details> (lines 1..6 = E2..E4) and <transpose> (-1 octave)
    ensureStaffDetailsInXml(doc);

    // 2. Independent per-voice state across the entire piece
    const prevNonOpenFretByVoice = new Map<string, number>();
    const activeTies = new Map<string, { stringNum: number; fret: number }>();

    const measures = doc.querySelectorAll('part > measure, measure');
    const processedMeasures = new Set<Element>();

    measures.forEach((measure) => {
      if (processedMeasures.has(measure)) return;
      processedMeasures.add(measure);

      let cursorOffset = 0;
      let lastChordAnchorOffset = 0;
      let currentVoiceStream: string | null = null;
      let sawBackupOrForwardSinceLastNote = false;

      const timedNotes: TimedNoteEvent[] = [];
      const voicesInMeasure = new Set<string>();

      const children = Array.from(measure.children);
      for (const child of children) {
        const tag = child.tagName;

        if (tag === 'backup') {
          const dur = parseInt(child.querySelector('duration')?.textContent?.trim() || '0', 10);
          cursorOffset = Math.max(0, cursorOffset - dur);
          lastChordAnchorOffset = cursorOffset;
          sawBackupOrForwardSinceLastNote = true;
          continue;
        }

        if (tag === 'forward') {
          const dur = parseInt(child.querySelector('duration')?.textContent?.trim() || '0', 10);
          cursorOffset += dur;
          lastChordAnchorOffset = cursorOffset;
          sawBackupOrForwardSinceLastNote = true;
          continue;
        }

        if (tag !== 'note') {
          continue;
        }

        const noteEl = child;
        const isGrace = getDirectChild(noteEl, 'grace') !== null;
        const isChord = getDirectChild(noteEl, 'chord') !== null;
        const isRest = getDirectChild(noteEl, 'rest') !== null;
        const voiceId = getDirectChild(noteEl, 'voice')?.textContent?.trim() || '1';
        const dur = isGrace
          ? 0
          : parseInt(getDirectChild(noteEl, 'duration')?.textContent?.trim() || '0', 10);

        // Auto-repair missing <backup> if a new voice starts after a previous voice without <backup>
        if (
          !isChord &&
          currentVoiceStream !== null &&
          voiceId !== currentVoiceStream &&
          !sawBackupOrForwardSinceLastNote &&
          cursorOffset > 0
        ) {
          const backupEl = doc.createElement('backup');
          const backupDurEl = doc.createElement('duration');
          backupDurEl.textContent = String(cursorOffset);
          backupEl.appendChild(backupDurEl);
          measure.insertBefore(backupEl, noteEl);
          cursorOffset = 0;
          lastChordAnchorOffset = 0;
        }

        currentVoiceStream = voiceId;
        sawBackupOrForwardSinceLastNote = false;
        voicesInMeasure.add(voiceId);

        let attackOffset = cursorOffset;
        if (isChord) {
          attackOffset = lastChordAnchorOffset;
        } else if (!isGrace) {
          attackOffset = cursorOffset;
          lastChordAnchorOffset = cursorOffset;
          cursorOffset += dur;
        }

        if (isRest) {
          continue;
        }

        const pitchEl = getDirectChild(noteEl, 'pitch');
        if (!pitchEl) {
          continue;
        }

        const step = pitchEl.querySelector('step')?.textContent?.trim() || 'C';
        const octave = parseInt(pitchEl.querySelector('octave')?.textContent?.trim() || '4', 10);
        const alter = parseInt(pitchEl.querySelector('alter')?.textContent?.trim() || '0', 10);

        const writtenMidi = getMidiFromPitch(step, octave, alter);
        // Written guitar treble clef sounds 1 octave (12 semitones) lower than written
        const soundingMidi = writtenMidi - 12;

        timedNotes.push({
          noteEl,
          voiceId,
          attackOffset,
          duration: dur,
          isGrace,
          soundingMidi,
          isTieStart: hasTieOfType(noteEl, 'start'),
          isTieStop: hasTieOfType(noteEl, 'stop'),
        });
      }

      if (timedNotes.length === 0) return;

      const isPolyphonicMeasure = voicesInMeasure.size > 1;
      const ringingNotes: RingingNote[] = [];

      // Group notes by (attackOffset, isGrace) so grace notes precede main beat attacks,
      // and ALL simultaneous main beat attacks across Voice 1 + Voice 2 + <chord/> are solved together!
      const groupsBySubOffset = new Map<number, TimedNoteEvent[]>();
      for (const tn of timedNotes) {
        const groupKey = tn.attackOffset * 2 + (tn.isGrace ? 0 : 1);
        const list = groupsBySubOffset.get(groupKey);
        if (list) {
          list.push(tn);
        } else {
          groupsBySubOffset.set(groupKey, [tn]);
        }
      }

      const sortedKeys = Array.from(groupsBySubOffset.keys()).sort((a, b) => a - b);

      for (const key of sortedKeys) {
        const notesAtBeat = groupsBySubOffset.get(key)!;
        const beatOffset = notesAtBeat[0].attackOffset;

        // Prune expired ringing notes
        for (let i = ringingNotes.length - 1; i >= 0; i--) {
          if (ringingNotes[i].endOffset <= beatOffset) {
            ringingNotes.splice(i, 1);
          }
        }

        // Build candidate options per note using its own voice's independent hand position
        const candidatesPerNote = notesAtBeat.map((n) => {
          const voicePrev = prevNonOpenFretByVoice.get(n.voiceId) ?? 2;
          const tieKey = `${n.voiceId}:${n.soundingMidi}`;
          const tied = n.isTieStop ? activeTies.get(tieKey) : undefined;
          return getNoteCandidates(n, voicePrev, isPolyphonicMeasure, tied, ringingNotes);
        });

        const assigned = solveSimultaneousBeatAssignment(notesAtBeat, candidatesPerNote);

        for (let i = 0; i < notesAtBeat.length; i++) {
          const n = notesAtBeat[i];
          const { stringNum, fret } = assigned[i];

          // Update independent per-voice hand position
          if (fret > 0) {
            prevNonOpenFretByVoice.set(n.voiceId, fret);
          } else if (!prevNonOpenFretByVoice.has(n.voiceId)) {
            prevNonOpenFretByVoice.set(n.voiceId, 2);
          }

          // Track active ties per voice + pitch
          const tieKey = `${n.voiceId}:${n.soundingMidi}`;
          if (n.isTieStart) {
            activeTies.set(tieKey, { stringNum, fret });
          } else if (n.isTieStop) {
            activeTies.delete(tieKey);
          }

          // Track ringing note for voice sustain awareness
          if (!n.isGrace && n.duration > 0) {
            ringingNotes.push({
              voiceId: n.voiceId,
              endOffset: n.attackOffset + n.duration,
              stringNum,
            });
          }

          // Inject <notations><technical><string>S</string><fret>F</fret></technical></notations>
          let notationsEl = getDirectChild(n.noteEl, 'notations');
          if (!notationsEl) {
            notationsEl = doc.createElement('notations');
            n.noteEl.appendChild(notationsEl);
          }

          syncTieNotations(doc, n.noteEl, notationsEl);

          let technicalEl = getDirectChild(notationsEl, 'technical');
          if (!technicalEl) {
            technicalEl = doc.createElement('technical');
            notationsEl.appendChild(technicalEl);
          }

          technicalEl.querySelectorAll('string, fret').forEach((el) => el.remove());

          const stringTag = doc.createElement('string');
          stringTag.textContent = String(stringNum);

          const fretTag = doc.createElement('fret');
          fretTag.textContent = String(fret);

          technicalEl.appendChild(stringTag);
          technicalEl.appendChild(fretTag);
        }
      }
    });

    const serializer = new XMLSerializer();
    let result = serializer.serializeToString(doc);

    result = result.replace(/<!DOCTYPE[^>]*>/gi, '').trim();
    if (!result.startsWith('<?xml')) {
      result = '<?xml version="1.0" encoding="UTF-8"?>\n' + result;
    }

    return result;
  } catch (err) {
    console.error('Error in assignErgonomicGuitarTab:', err);
    return musicXml;
  }
}
