export type ReminderSoundId = 'soft-chime' | 'clear-bell' | 'radar-pulse';

export interface ReminderSoundSettings {
  enabled: boolean;
  sound: ReminderSoundId;
}

export const reminderSoundOptions: ReadonlyArray<{
  value: ReminderSoundId;
  label: string;
  description: string;
}> = [
  { value: 'soft-chime', label: '轻柔叮咚', description: '两段柔和提示，适合日常使用' },
  { value: 'clear-bell', label: '清亮铃声', description: '音色更明亮，适合重要价格提醒' },
  { value: 'radar-pulse', label: '雷达脉冲', description: '三段短促提示，适合监控场景' },
];

const STORAGE_KEY = 'trading-diary:reminder-sound:v1';
const SETTINGS_CHANGED_EVENT = 'reminder-sound-settings-changed';
const DEFAULT_SETTINGS: ReminderSoundSettings = { enabled: true, sound: 'soft-chime' };
const validSoundIds = new Set<ReminderSoundId>(reminderSoundOptions.map((option) => option.value));

let audioContext: AudioContext | null = null;

interface ToneStep {
  frequency: number;
  delay: number;
  duration: number;
  volume: number;
  type: OscillatorType;
}

const tonePatterns: Record<ReminderSoundId, readonly ToneStep[]> = {
  'soft-chime': [
    { frequency: 659.25, delay: 0, duration: 0.22, volume: 0.14, type: 'sine' },
    { frequency: 987.77, delay: 0.12, duration: 0.34, volume: 0.11, type: 'sine' },
  ],
  'clear-bell': [
    { frequency: 880, delay: 0, duration: 0.2, volume: 0.12, type: 'triangle' },
    { frequency: 1318.51, delay: 0.16, duration: 0.42, volume: 0.1, type: 'triangle' },
  ],
  'radar-pulse': [
    { frequency: 740, delay: 0, duration: 0.1, volume: 0.12, type: 'sine' },
    { frequency: 740, delay: 0.16, duration: 0.1, volume: 0.12, type: 'sine' },
    { frequency: 1046.5, delay: 0.32, duration: 0.2, volume: 0.1, type: 'sine' },
  ],
};

export function getReminderSoundSettings(): ReminderSoundSettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const saved = JSON.parse(raw) as Partial<ReminderSoundSettings>;
    return {
      enabled: typeof saved.enabled === 'boolean' ? saved.enabled : DEFAULT_SETTINGS.enabled,
      sound: saved.sound && validSoundIds.has(saved.sound) ? saved.sound : DEFAULT_SETTINGS.sound,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveReminderSoundSettings(settings: ReminderSoundSettings): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  window.dispatchEvent(new CustomEvent<ReminderSoundSettings>(SETTINGS_CHANGED_EVENT, { detail: settings }));
}

function getAudioContext(): AudioContext {
  audioContext ??= new AudioContext();
  return audioContext;
}

export async function playReminderSound(sound: ReminderSoundId): Promise<void> {
  const context = getAudioContext();
  if (context.state === 'suspended') await context.resume();

  const startAt = context.currentTime + 0.02;
  for (const step of tonePatterns[sound]) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const noteStart = startAt + step.delay;
    const noteEnd = noteStart + step.duration;

    oscillator.type = step.type;
    oscillator.frequency.setValueAtTime(step.frequency, noteStart);
    gain.gain.setValueAtTime(0.0001, noteStart);
    gain.gain.exponentialRampToValueAtTime(step.volume, noteStart + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, noteEnd);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(noteStart);
    oscillator.stop(noteEnd + 0.02);
  }
}

export async function playConfiguredReminderSound(): Promise<boolean> {
  const settings = getReminderSoundSettings();
  if (!settings.enabled) return false;
  await playReminderSound(settings.sound);
  return true;
}
