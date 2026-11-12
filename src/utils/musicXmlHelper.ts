/**
 * Utilities for cleaning, parsing, and downloading MusicXML files
 */

export interface ScoreMeta {
  title: string;
  beats: string;
  beatType: string;
  tempo: number;
  clef: string;
  measureCount: number;
  voiceCount: number;
}

/**
 * Prepares raw MusicXML string for alphaTab's built-in parser.
 * AlphaTab's lightweight internal XML parser rejects DOCTYPE declarations
 * and needs raw, well-formed XML.
 */
export function cleanMusicXmlForAlphaTab(xml: string): string {
  if (!xml) return '';

  let cleaned = xml.trim();

  // 1. Remove markdown fences if present
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:xml|musicxml)?\s*/i, '');
    cleaned = cleaned.replace(/\s*```$/, '');
    cleaned = cleaned.trim();
  }

  // 2. Strip DOCTYPE declarations (alphaTab XmlDocument does not support DTDs)
  cleaned = cleaned.replace(/<!DOCTYPE[^>]*>/gi, '');

  // 3. Ensure <?xml prefix exists
  if (!cleaned.startsWith('<?xml') && cleaned.includes('<score-partwise')) {
    cleaned = '<?xml version="1.0" encoding="UTF-8"?>\n' + cleaned.substring(cleaned.indexOf('<score-partwise'));
  }

  // 4. Clean trailing garbage or partial characters after </score-partwise>
  const closingIdx = cleaned.lastIndexOf('</score-partwise>');
  if (closingIdx !== -1) {
    cleaned = cleaned.substring(0, closingIdx + '</score-partwise>'.length);
  }

  return cleaned.trim();
}

/**
 * Extracts high-level metadata from MusicXML string for the UI header
 */
export function extractScoreMeta(xml: string): ScoreMeta {
  const meta: ScoreMeta = {
    title: 'Guitar Tablature',
    beats: '4',
    beatType: '4',
    tempo: 100,
    clef: 'Treble (Standard Guitar)',
    measureCount: 0,
    voiceCount: 1,
  };

  try {
    const titleMatch = xml.match(/<work-title>([\s\S]*?)<\/work-title>/i);
    if (titleMatch && titleMatch[1]) {
      meta.title = titleMatch[1].trim();
    } else {
      const partNameMatch = xml.match(/<part-name>([\s\S]*?)<\/part-name>/i);
      if (partNameMatch && partNameMatch[1]) {
        meta.title = partNameMatch[1].trim();
      }
    }

    const beatsMatch = xml.match(/<beats>(\d+)<\/beats>/i);
    if (beatsMatch && beatsMatch[1]) {
      meta.beats = beatsMatch[1];
    }

    const beatTypeMatch = xml.match(/<beat-type>(\d+)<\/beat-type>/i);
    if (beatTypeMatch && beatTypeMatch[1]) {
      meta.beatType = beatTypeMatch[1];
    }

    const tempoMatch = xml.match(/tempo="(\d+)"/i) || xml.match(/<per-minute>(\d+)<\/per-minute>/i);
    if (tempoMatch && tempoMatch[1]) {
      meta.tempo = parseInt(tempoMatch[1], 10);
    }

    const measureMatches = xml.match(/<measure(?:\s+[^>]*)?>/gi);
    if (measureMatches) {
      meta.measureCount = measureMatches.length;
    }

    const voiceSet = new Set<string>();
    const voiceRegex = /<voice>\s*([^<\s]+)\s*<\/voice>/gi;
    let voiceMatch: RegExpExecArray | null;
    while ((voiceMatch = voiceRegex.exec(xml)) !== null) {
      if (voiceMatch[1]) {
        voiceSet.add(voiceMatch[1]);
      }
    }
    if (voiceSet.size > 0) {
      meta.voiceCount = voiceSet.size;
    }
  } catch (e) {
    console.warn('Could not parse score metadata:', e);
  }

  return meta;
}

/**
 * Triggers a browser download of the MusicXML file
 */
export function downloadMusicXmlFile(xml: string, filename = 'guitar-tab.xml'): void {
  // Ensure formatted XML with DOCTYPE for external music apps like MuseScore, Guitar Pro, or Finale
  let downloadContent = xml.trim();
  if (!downloadContent.includes('<!DOCTYPE')) {
    downloadContent = downloadContent.replace(
      /(<score-partwise[^>]*>)/i,
      '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">\n$1'
    );
  }

  const blob = new Blob([downloadContent], { type: 'application/vnd.recordare.musicxml+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.xml') ? filename : `${filename}.xml`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
