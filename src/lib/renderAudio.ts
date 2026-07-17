import * as Tone from 'tone'
import { clamp, type Sequence } from './sequence'

// Rendu hors-ligne d'une Sequence en AudioBuffer via Tone.Offline.
//
// Timbres : le lead est un piano electrique FM avec un leger vibrato, la
// nappe un choeur de sinusoides desaccordees elargi en stereo, la basse une
// FM ronde, l'arpege un pluck FM type kalimba. Grosse caisse et charley
// restent hors de la chaine d'effets, avec un petit envoi de reverberation
// pour partager le meme espace.
//
// Humanisation : chaque evenement recoit un micro-decalage de temps et de
// velocite derive d'un hash de son index - le rendu reste strictement
// deterministe, donc rejouable a l'identique depuis l'historique.
//
// Mixage : compresseur de glue puis limiteur contre l'ecretage. Les reglages
// viennent de la Sequence, pour l'ecoute comme pour l'export.

export const SAMPLE_RATE = 44100

// Hash -> valeur dans [-0.5, 0.5), stable pour un meme index.
function jitter(i: number): number {
  return (((i * 2654435761) >>> 0) / 4294967296) - 0.5
}

export async function renderSequence(sequence: Sequence): Promise<AudioBuffer> {
  const toneBuffer = await Tone.Offline(
    ({ transport }) => {
      const { effects } = sequence

      const limiter = new Tone.Limiter(-1).toDestination()
      const glue = new Tone.Compressor({ threshold: -16, ratio: 3, attack: 0.02, release: 0.2 }).connect(limiter)
      const reverb = new Tone.Reverb({ decay: 3.8, preDelay: 0.02, wet: effects.reverbWet }).connect(glue)
      const delay = new Tone.FeedbackDelay({
        delayTime: 0.28,
        feedback: effects.delayFeedback,
        wet: effects.delayWet,
      }).connect(reverb)
      const chorus = new Tone.Chorus({
        frequency: 0.5,
        depth: effects.chorusDepth,
        wet: effects.chorusDepth > 0 ? 0.4 : 0,
      })
        .connect(delay)
        .start()
      const filter = new Tone.Filter({ frequency: effects.filterCutoff, type: 'lowpass', rolloff: -12 }).connect(
        chorus,
      )

      // Lead : piano electrique FM, vibrato lent pour le naturel.
      const leadVibrato = new Tone.Vibrato({ frequency: 4.4, depth: 0.06 }).connect(filter)
      const lead = new Tone.PolySynth(Tone.FMSynth, {
        harmonicity: 2,
        modulationIndex: 4.5,
        oscillator: { type: 'sine' },
        envelope: { attack: 0.012, decay: 0.5, sustain: 0.25, release: 0.9 },
        modulation: { type: 'sine' },
        modulationEnvelope: { attack: 0.004, decay: 0.3, sustain: 0.08, release: 0.4 },
        volume: -8,
      }).connect(leadVibrato)

      // Nappe : sinusoides desaccordees, attaque lente, elargie en stereo.
      const padWidener = new Tone.StereoWidener(0.8).connect(filter)
      const pad = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'fatsine', count: 3, spread: 22 },
        envelope: { attack: 0.9, decay: 0.4, sustain: 0.6, release: 2.2 },
        volume: -17,
      }).connect(padWidener)

      // Basse : FM ronde, un soupcon d'harmoniques mouvantes.
      const bass = new Tone.PolySynth(Tone.FMSynth, {
        harmonicity: 1,
        modulationIndex: 3,
        oscillator: { type: 'sine' },
        envelope: { attack: 0.045, decay: 0.25, sustain: 0.7, release: 0.6 },
        modulation: { type: 'sine' },
        modulationEnvelope: { attack: 0.02, decay: 0.4, sustain: 0.2, release: 0.4 },
        volume: -9,
      }).connect(filter)

      // Arpege : pluck FM type kalimba, decale a droite, en retrait.
      const arpPan = new Tone.Panner(0.3).connect(filter)
      const arp = new Tone.PolySynth(Tone.FMSynth, {
        harmonicity: 3.01,
        modulationIndex: 7,
        oscillator: { type: 'sine' },
        envelope: { attack: 0.003, decay: 0.22, sustain: 0, release: 0.35 },
        modulation: { type: 'sine' },
        modulationEnvelope: { attack: 0.002, decay: 0.08, sustain: 0, release: 0.1 },
        volume: -15,
      }).connect(arpPan)

      // Percussions hors de la chaine d'effets, avec un petit envoi de
      // reverberation pour partager l'espace du reste de l'arrangement.
      const percRoom = new Tone.Gain(0.14).connect(reverb)

      const kickOut = new Tone.Gain(1).connect(glue)
      kickOut.connect(percRoom)
      const kick = new Tone.MembraneSynth({
        pitchDecay: 0.05,
        octaves: 6,
        envelope: { attack: 0.001, decay: 0.4, sustain: 0, release: 0.12 },
        volume: -7,
      }).connect(kickOut)

      const hatPan = new Tone.Panner(-0.22).connect(glue)
      hatPan.connect(percRoom)
      const hatBand = new Tone.Filter({ frequency: 9500, type: 'bandpass', Q: 0.9 }).connect(hatPan)
      const hat = new Tone.NoiseSynth({
        noise: { type: 'white' },
        envelope: { attack: 0.001, decay: 0.045, sustain: 0, release: 0.025 },
        volume: -17,
      }).connect(hatBand)

      const polyVoices = { lead, pad, bass, arp }

      sequence.events.forEach((event, i) => {
        // La grosse caisse reste sur la grille ; le reste respire un peu.
        const timeJitter = event.role === 'kick' ? 0 : jitter(i) * 0.014
        const velocity = clamp(event.velocity * (1 + jitter(i + 7919) * 0.12), 0.05, 1)
        transport.schedule(
          (t) => {
            if (event.role === 'kick') {
              kick.triggerAttackRelease(event.note, event.duration, t, velocity)
            } else if (event.role === 'hat') {
              hat.triggerAttackRelease(event.duration, t, velocity)
            } else {
              polyVoices[event.role].triggerAttackRelease(event.note, event.duration, t, velocity)
            }
          },
          Math.max(0, event.time + timeJitter),
        )
      })

      transport.start(0)
    },
    sequence.duration,
    2,
    SAMPLE_RATE,
  )

  return toneBuffer.get() as AudioBuffer
}
