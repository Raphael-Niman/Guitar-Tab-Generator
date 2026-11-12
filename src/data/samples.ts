/**
 * Built-in sample songs for instant testing and demonstration
 */

export interface SampleSong {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  timeSignature: string;
  key: string;
  tempo: number;
  xml: string;
}

export const C_MAJOR_8_BAR_SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <work>
    <work-title>C Major Acoustic Guitar Melody (8 Bars)</work-title>
  </work>
  <identification>
    <creator type="composer">GuitarTabGenerator Built-in Sample</creator>
  </identification>
  <part-list>
    <score-part id="P1">
      <part-name>Acoustic Guitar</part-name>
      <score-instrument id="P1-I1">
        <instrument-name>Acoustic Guitar</instrument-name>
      </score-instrument>
      <midi-instrument id="P1-I1">
        <midi-program>26</midi-program>
      </midi-instrument>
    </score-part>
  </part-list>
  <part id="P1">
    <!-- Bar 1: C Major arpeggio -->
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
        <staff-details>
          <staff-lines>6</staff-lines>
          <staff-tuning line="1"><tuning-step>E</tuning-step><tuning-octave>2</tuning-octave></staff-tuning>
          <staff-tuning line="2"><tuning-step>A</tuning-step><tuning-octave>2</tuning-octave></staff-tuning>
          <staff-tuning line="3"><tuning-step>D</tuning-step><tuning-octave>3</tuning-octave></staff-tuning>
          <staff-tuning line="4"><tuning-step>G</tuning-step><tuning-octave>3</tuning-octave></staff-tuning>
          <staff-tuning line="5"><tuning-step>B</tuning-step><tuning-octave>3</tuning-octave></staff-tuning>
          <staff-tuning line="6"><tuning-step>E</tuning-step><tuning-octave>4</tuning-octave></staff-tuning>
        </staff-details>
        <transpose>
          <diatonic>0</diatonic>
          <chromatic>0</chromatic>
          <octave-change>-1</octave-change>
        </transpose>
      </attributes>
      <direction placement="above"><sound tempo="100"/></direction>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type></note>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>4</duration><type>quarter</type></note>
    </measure>
    <!-- Bar 2: G / B descending -->
    <measure number="2">
      <note><pitch><step>B</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>2</duration><type>eighth</type></note>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>2</duration><type>eighth</type></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>8</duration><type>half</type></note>
    </measure>
    <!-- Bar 3: A Minor passage -->
    <measure number="3">
      <note><pitch><step>A</step><octave>3</octave></pitch><duration>4</duration><type>quarter</type></note>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type></note>
      <note><pitch><step>A</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type></note>
    </measure>
    <!-- Bar 4: F Major turnaround -->
    <measure number="4">
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type></note>
      <note><pitch><step>A</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type></note>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>4</duration><type>quarter</type></note>
      <note><pitch><step>A</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type></note>
    </measure>
    <!-- Bar 5: G7 dominant arpeggio -->
    <measure number="5">
      <note><pitch><step>G</step><octave>3</octave></pitch><duration>4</duration><type>quarter</type></note>
      <note><pitch><step>B</step><octave>3</octave></pitch><duration>4</duration><type>quarter</type></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type></note>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type></note>
    </measure>
    <!-- Bar 6: E minor to A minor -->
    <measure number="6">
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type></note>
      <note><pitch><step>A</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type></note>
    </measure>
    <!-- Bar 7: Dm leading into resolution -->
    <measure number="7">
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type></note>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type></note>
      <note><pitch><step>B</step><octave>3</octave></pitch><duration>4</duration><type>quarter</type></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type></note>
    </measure>
    <!-- Bar 8: Final C Major Chord in open position ringing out -->
    <measure number="8">
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>16</duration><type>whole</type></note>
      <note><chord/><pitch><step>E</step><octave>4</octave></pitch><duration>16</duration><type>whole</type></note>
      <note><chord/><pitch><step>G</step><octave>4</octave></pitch><duration>16</duration><type>whole</type></note>
      <note><chord/><pitch><step>C</step><octave>5</octave></pitch><duration>16</duration><type>whole</type></note>
      <note><chord/><pitch><step>E</step><octave>5</octave></pitch><duration>16</duration><type>whole</type></note>
    </measure>
  </part>
</score-partwise>`;

export const ROMANZA_SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <work>
    <work-title>Spanish Romance (Romanza Anonimo)</work-title>
  </work>
  <part-list>
    <score-part id="P1">
      <part-name>Classical Guitar</part-name>
      <midi-instrument id="P1-I1"><midi-program>25</midi-program></midi-instrument>
    </score-part>
  </part-list>
  <part id="P1">
    <!-- Bar 1: E minor polyphonic fingerstyle (Voice 1 melody + Voice 2 sustained E3 bass) -->
    <measure number="1">
      <attributes>
        <divisions>3</divisions>
        <key><fifths>1</fifths></key>
        <time><beats>3</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
        <staff-details>
          <staff-lines>6</staff-lines>
          <staff-tuning line="1"><tuning-step>E</tuning-step><tuning-octave>2</tuning-octave></staff-tuning>
          <staff-tuning line="2"><tuning-step>A</tuning-step><tuning-octave>2</tuning-octave></staff-tuning>
          <staff-tuning line="3"><tuning-step>D</tuning-step><tuning-octave>3</tuning-octave></staff-tuning>
          <staff-tuning line="4"><tuning-step>G</tuning-step><tuning-octave>3</tuning-octave></staff-tuning>
          <staff-tuning line="5"><tuning-step>B</tuning-step><tuning-octave>3</tuning-octave></staff-tuning>
          <staff-tuning line="6"><tuning-step>E</tuning-step><tuning-octave>4</tuning-octave></staff-tuning>
        </staff-details>
        <transpose>
          <diatonic>0</diatonic>
          <chromatic>0</chromatic>
          <octave-change>-1</octave-change>
        </transpose>
      </attributes>
      <direction placement="above"><sound tempo="84"/></direction>
      <note><pitch><step>B</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification><stem>up</stem></note>
      <note><pitch><step>B</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification><stem>up</stem></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification><stem>up</stem></note>
      <note><pitch><step>B</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification><stem>up</stem></note>
      <note><pitch><step>B</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification><stem>up</stem></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification><stem>up</stem></note>
      <note><pitch><step>B</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification><stem>up</stem></note>
      <note><pitch><step>B</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification><stem>up</stem></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification><stem>up</stem></note>
      <backup><duration>9</duration></backup>
      <note><pitch><step>E</step><octave>3</octave></pitch><duration>9</duration><voice>2</voice><type>half</type><dot/><stem>down</stem></note>
    </measure>
    <!-- Bar 2: Descending melody over sustained E3 bass -->
    <measure number="2">
      <note><pitch><step>B</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification><stem>up</stem></note>
      <note><pitch><step>B</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification><stem>up</stem></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification><stem>up</stem></note>
      <note><pitch><step>A</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification><stem>up</stem></note>
      <note><pitch><step>B</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification><stem>up</stem></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification><stem>up</stem></note>
      <note><pitch><step>G</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification><stem>up</stem></note>
      <note><pitch><step>B</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification><stem>up</stem></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification><stem>up</stem></note>
      <backup><duration>9</duration></backup>
      <note><pitch><step>E</step><octave>3</octave></pitch><duration>9</duration><voice>2</voice><type>half</type><dot/><stem>down</stem></note>
    </measure>
    <!-- Bar 3: Resolution phrase over E3 bass -->
    <measure number="3">
      <note><pitch><step>G</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification><stem>up</stem></note>
      <note><pitch><step>B</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification><stem>up</stem></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification><stem>up</stem></note>
      <note><pitch><step>F</step><alter>1</alter><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification><stem>up</stem></note>
      <note><pitch><step>B</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification><stem>up</stem></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification><stem>up</stem></note>
      <note><pitch><step>E</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification><stem>up</stem></note>
      <note><pitch><step>B</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification><stem>up</stem></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification><stem>up</stem></note>
      <backup><duration>9</duration></backup>
      <note><pitch><step>E</step><octave>3</octave></pitch><duration>9</duration><voice>2</voice><type>half</type><dot/><stem>down</stem></note>
    </measure>
  </part>
</score-partwise>`;

export const SAMPLE_SONGS: SampleSong[] = [
  {
    id: 'c-major-8-bar',
    title: 'C Major Acoustic Melody',
    subtitle: '8 Bars • 4/4 • 100 BPM',
    description: 'Arpeggios and lyrical motifs in open position resolving to a full 5-string C major chord. Built for instant test.',
    timeSignature: '4/4',
    key: 'C Major',
    tempo: 100,
    xml: C_MAJOR_8_BAR_SAMPLE,
  },
  {
    id: 'spanish-romance',
    title: 'Spanish Romance (Romanza)',
    subtitle: '3/4 • 84 BPM • E minor',
    description: 'Iconic classical fingerstyle guitar study in E minor with open string arpeggio accompaniment.',
    timeSignature: '3/4',
    key: 'E minor',
    tempo: 84,
    xml: ROMANZA_SAMPLE,
  },
];
