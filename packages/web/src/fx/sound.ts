/**
 * Audio cues for the five events that decide matches.
 *
 * There was no audio in this project and building one was explicitly not the job,
 * so this is the smallest thing that reinforces the visual language: a synthesised
 * blip per cue, no assets, no music, no mixer. It exists to *agree* with what the
 * board just showed — a rising pair for a capture, a falling snap for a cut — never
 * to carry information on its own.
 *
 * Off by default and persisted, because a browser game that starts making noise
 * unasked is worse than a silent one, and because the brief is clear that the
 * visuals have to work without it.
 *
 * The cue table is pure and tested. Only {@link playCue} touches the audio device.
 */

import type { FxOverlayKind } from './present';

export const SOUND_STORAGE_KEY = 'conquarrow:sound';

export interface SoundCue {
  /** Start and end pitch (Hz). Rising reads as gain, falling as loss. */
  readonly fromHz: number;
  readonly toHz: number;
  readonly ms: number;
  readonly gain: number;
  readonly wave: OscillatorType;
}

/**
 * Five cues, in the brief's priority order. Everything else is silent — a sound on
 * every step would be the audio equivalent of a fireworks display.
 */
const CUES: Partial<Record<FxOverlayKind, SoundCue>> = {
  // Enclosure: two-note rise, the "it closed" note.
  loopPulse: { fromHz: 392, toHz: 587, ms: 150, gain: 0.05, wave: 'triangle' },
  // Capture: lower, broader, lands after the closure.
  captureFill: { fromHz: 262, toHz: 440, ms: 240, gain: 0.055, wave: 'sine' },
  // Cut: a downward snap. Sharp attack, short.
  cutSnap: { fromHz: 740, toHz: 180, ms: 130, gain: 0.06, wave: 'sawtooth' },
  // Combat: a dull mid knock, no pitch travel — impact, not movement.
  combat: { fromHz: 200, toHz: 165, ms: 110, gain: 0.05, wave: 'square' },
  // Production: a small bright tick, quietest of the five.
  emergence: { fromHz: 880, toHz: 1175, ms: 90, gain: 0.035, wave: 'sine' },
  // Losing ground: the capture cue inverted, so the pair is unmistakable.
  lossRetract: { fromHz: 440, toHz: 233, ms: 240, gain: 0.05, wave: 'sine' },
};

export const cueFor = (kind: FxOverlayKind): SoundCue | undefined => CUES[kind];

/** Kinds that make a sound at all. Exported so a test can pin the list. */
export const AUDIBLE_KINDS: readonly FxOverlayKind[] = Object.keys(CUES) as FxOverlayKind[];

export const loadSoundEnabled = (): boolean => {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(SOUND_STORAGE_KEY) === 'on';
};

export const saveSoundEnabled = (on: boolean): void => {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(SOUND_STORAGE_KEY, on ? 'on' : 'off');
};

type Ctor = new () => AudioContext;

let ctx: AudioContext | undefined;

const audioContext = (): AudioContext | undefined => {
  if (ctx !== undefined) return ctx;
  const w = window as unknown as { AudioContext?: Ctor; webkitAudioContext?: Ctor };
  const Impl = w.AudioContext ?? w.webkitAudioContext;
  if (Impl === undefined) return undefined;
  ctx = new Impl();
  return ctx;
};

/**
 * Play one cue, `delayMs` from now — the same offset its overlay uses, so sound
 * and picture stay together through a staggered chain.
 *
 * Silently does nothing without an audio device or before a user gesture. A cue
 * that cannot play is not an error; it is a game that stays playable.
 */
export const playCue = (cue: SoundCue, delayMs = 0): void => {
  const audio = audioContext();
  if (audio === undefined) return;
  if (audio.state === 'suspended') void audio.resume();
  const at = audio.currentTime + delayMs / 1000;
  const secs = cue.ms / 1000;
  const osc = audio.createOscillator();
  const amp = audio.createGain();
  osc.type = cue.wave;
  osc.frequency.setValueAtTime(cue.fromHz, at);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, cue.toHz), at + secs);
  // Short attack, exponential release: a tick, never a drone.
  amp.gain.setValueAtTime(0.0001, at);
  amp.gain.exponentialRampToValueAtTime(cue.gain, at + Math.min(0.02, secs * 0.25));
  amp.gain.exponentialRampToValueAtTime(0.0001, at + secs);
  osc.connect(amp).connect(audio.destination);
  osc.start(at);
  osc.stop(at + secs + 0.02);
};

/**
 * Cue whatever is audible in a freshly queued batch.
 *
 * At most one sound per kind per batch: a capture of forty tiles is one event to a
 * player, and forty overlapping blips would be a chord nobody asked for.
 */
export const playOverlayCues = (
  overlays: readonly { readonly kind: FxOverlayKind; readonly offsetMs: number }[],
): void => {
  const heard = new Set<FxOverlayKind>();
  for (const overlay of overlays) {
    if (heard.has(overlay.kind)) continue;
    const cue = cueFor(overlay.kind);
    if (cue === undefined) continue;
    heard.add(overlay.kind);
    playCue(cue, overlay.offsetMs);
  }
};
