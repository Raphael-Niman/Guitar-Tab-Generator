import * as alphaTab from '@coderline/alphatab';

/**
 * AlphaTab internal Staff.stringTuning.tunings order (high string index 0 to low string index 5):
 * Index 0 (High E4): 64 -> alphaTab note.string = 6
 * Index 1 (B3):      59 -> alphaTab note.string = 5
 * Index 2 (G3):      55 -> alphaTab note.string = 4
 * Index 3 (D3):      50 -> alphaTab note.string = 3
 * Index 4 (A2):      45 -> alphaTab note.string = 2
 * Index 5 (Low E2):  40 -> alphaTab note.string = 1
 */
export const STANDARD_GUITAR_TUNING = [64, 59, 55, 50, 45, 40];

/**
 * Ensures that an alphaTab Score object has:
 * 1. 6-string guitar tuning initialized on every staff so the Tab renderer can build.
 * 2. Standard 8vb display transposition (-12) so written treble ledger lines match printed guitar scores.
 * 3. Both standard notation AND guitar tablature rendering enabled.
 * 4. Multi-voice string exclusivity across simultaneous beat playbackStart offsets.
 */
export function ensureGuitarScoreConfig(score: alphaTab.model.Score): alphaTab.model.Score {
  if (!score || !score.tracks || score.tracks.length === 0) return score;

  for (const track of score.tracks) {
    if (!track.staves || track.staves.length === 0) continue;

    for (const staff of track.staves) {
      staff.showStandardNotation = true;
      staff.showTablature = true;

      // Ensure 6-string tuning is set on staff
      if (!staff.stringTuning || !staff.stringTuning.tunings || staff.stringTuning.tunings.length === 0) {
        staff.stringTuning.tunings = [...STANDARD_GUITAR_TUNING];
      }

      // Ensure standard guitar 8vb display transposition if unset
      if (staff.displayTranspositionPitch === 0 && staff.transpositionPitch === 0) {
        staff.displayTranspositionPitch = -12;
      }

      const tuning = staff.stringTuning.tunings;
      const numStrings = tuning.length;

      // Track used alphaTab string indices per playbackStart offset across ALL voices in each bar
      for (const bar of staff.bars) {
        const usedStringsByOffset = new Map<number, Set<number>>();

        // First record already-assigned strings from assignErgonomicGuitarTab
        for (const voice of bar.voices) {
          if (voice.isEmpty) continue;
          for (const beat of voice.beats) {
            const offset = beat.playbackStart;
            let used = usedStringsByOffset.get(offset);
            if (!used) {
              used = new Set<number>();
              usedStringsByOffset.set(offset, used);
            }
            for (const note of beat.notes) {
              if (!Number.isNaN(note.string) && note.string > 0) {
                used.add(note.string);
              }
            }
          }
        }

        // Fallback assignment for any note still missing string/fret
        for (const voice of bar.voices) {
          if (voice.isEmpty) continue;
          for (const beat of voice.beats) {
            const offset = beat.playbackStart;
            let usedStrings = usedStringsByOffset.get(offset);
            if (!usedStrings) {
              usedStrings = new Set<number>();
              usedStringsByOffset.set(offset, usedStrings);
            }

            for (const note of beat.notes) {
              if (Number.isNaN(note.string) || note.string <= 0) {
                const pitch = note.realValue;
                let bestString = 1;
                let bestFret = 0;
                let bestCost = Number.MAX_VALUE;

                // In alphaTab model: string s in 1..6 maps to tuning[numStrings - s]
                for (let s = 1; s <= numStrings; s++) {
                  const openPitch = tuning[numStrings - s];
                  const fret = pitch - openPitch;

                  if (fret >= 0 && fret <= 22) {
                    let cost = 0;
                    if (fret === 0) cost -= 30;
                    else if (fret >= 1 && fret <= 4) cost -= 15;
                    else if (fret > 5) cost += (fret - 5) * 8;

                    if (usedStrings.has(s)) cost += 5000;

                    if (cost < bestCost) {
                      bestCost = cost;
                      bestString = s;
                      bestFret = fret;
                    }
                  }
                }

                note.string = bestString;
                note.fret = bestFret;
                usedStrings.add(bestString);
              }
            }
          }
        }
      }
    }
  }

  return score;
}
