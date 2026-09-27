import * as Speech from 'expo-speech';
import { splitForSpeech } from '../core/speechText';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Narración con la voz del sistema (expo-speech): gratis y sin conexión.
 *
 * Se habla párrafo a párrafo en vez de todo de golpe porque:
 * - Android no admite pause/resume y limita la longitud de cada texto;
 * - así "pausar" = parar y recordar el párrafo, y reanudar funciona igual en iOS y Android.
 *
 * Cuando se añada voz neuronal (MP3 pregenerado en el backend, columna guides.audio_path),
 * este módulo es el único punto a cambiar.
 */

export type NarratorState = 'idle' | 'playing' | 'paused';

let cachedVoice: string | null | undefined;

/** La mejor voz instalada para el idioma: calidad mejorada primero, variante local (es-ES) después. */
export async function pickVoice(lang = 'es'): Promise<string | null> {
  if (cachedVoice !== undefined) return cachedVoice;
  try {
    const voices = await Speech.getAvailableVoicesAsync();
    const candidates = voices.filter((v) => v.language.toLowerCase().startsWith(lang));
    const score = (v: Speech.Voice) =>
      (v.quality === Speech.VoiceQuality.Enhanced ? 10 : 0) + (v.language.toLowerCase() === `${lang}-es` ? 1 : 0);
    candidates.sort((a, b) => score(b) - score(a));
    cachedVoice = candidates[0]?.identifier ?? null;
  } catch {
    cachedVoice = null;
  }
  return cachedVoice;
}

export function useNarrator(text: string | null, lang = 'es') {
  const parts = useMemo(() => (text ? splitForSpeech(text, Math.min(Speech.maxSpeechInputLength || 3000, 3000)) : []), [text]);
  // El estado va ligado al texto que lo generó: si cambia el texto, se considera parado.
  const [status, setStatus] = useState<{ text: string | null; state: NarratorState; index: number }>({
    text: null,
    state: 'idle',
    index: 0,
  });
  const [rate, setRate] = useState(1);
  const token = useRef(0);
  const current = status.text === text ? status : { text, state: 'idle' as NarratorState, index: 0 };

  // Texto nuevo (o salir de la pantalla): se calla lo que estuviera sonando.
  useEffect(
    () => () => {
      token.current += 1;
      Speech.stop();
    },
    [text],
  );

  const speakFrom = useCallback(
    async (from: number, speed: number) => {
      const my = ++token.current;
      await Speech.stop();
      const voice = await pickVoice(lang);
      const next = (i: number) => {
        if (my !== token.current) return;
        if (i >= parts.length) {
          setStatus({ text, state: 'idle', index: 0 });
          return;
        }
        setStatus({ text, state: 'playing', index: i });
        Speech.speak(parts[i], {
          language: lang === 'es' ? 'es-ES' : lang,
          voice: voice ?? undefined,
          rate: speed,
          onDone: () => next(i + 1),
          onError: () => {
            if (my === token.current) setStatus({ text, state: 'idle', index: 0 });
          },
        });
      };
      next(from);
    },
    [lang, parts, text],
  );

  const play = useCallback(
    () => speakFrom(current.state === 'paused' ? current.index : 0, rate),
    [speakFrom, current.state, current.index, rate],
  );

  const pause = useCallback(() => {
    token.current += 1;
    Speech.stop();
    setStatus((s) => ({ ...s, state: 'paused' }));
  }, []);

  const stop = useCallback(() => {
    token.current += 1;
    Speech.stop();
    setStatus({ text, state: 'idle', index: 0 });
  }, [text]);

  const changeRate = useCallback(
    (r: number) => {
      setRate(r);
      // Si está sonando, retoma el párrafo actual a la nueva velocidad.
      if (current.state === 'playing') speakFrom(current.index, r);
    },
    [current.state, current.index, speakFrom],
  );

  return { state: current.state, index: current.index, total: parts.length, rate, play, pause, stop, setRate: changeRate };
}
