import { useCallback, useEffect, useRef, useState } from 'react';

// Speak-to-book. Web Speech API only — no dependency, no network of ours (the
// browser does the recognition). Deliberately FAIL-SOFT: it does not exist in
// the Capacitor iOS WKWebView or most in-app webviews, and permission can be
// denied, so `supported` gates the mic and every path still lets the customer
// type. We never block a booking on speech.

// Minimal shapes — the Web Speech types aren't in the default DOM lib, and we
// only touch a handful of fields. Kept local so nothing else has to know.
interface SpeechRecognitionAlternativeLike { transcript: string }
interface SpeechRecognitionResultLike {
  0: SpeechRecognitionAlternativeLike;
  isFinal: boolean;
  length: number;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: { length: number; [i: number]: SpeechRecognitionResultLike };
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export interface UseSpeechInput {
  /** True only when the browser can actually do speech recognition. */
  supported: boolean;
  /** True while the mic is live. */
  listening: boolean;
  /** 'denied' when the mic permission was refused; null otherwise. */
  error: 'denied' | 'error' | null;
  start: () => void;
  stop: () => void;
}

/**
 * @param onTranscript  called with the running transcript (interim + final) so
 *                      the caller can mirror it into the text field live.
 * @param onFinal       called once with the final phrase when the user stops
 *                      speaking — the caller treats it like a typed submit.
 */
export function useSpeechInput(
  onTranscript: (text: string) => void,
  onFinal: (text: string) => void,
): UseSpeechInput {
  const ctorRef = useRef<SpeechRecognitionCtor | null>(null);
  if (ctorRef.current === null) ctorRef.current = getCtor();
  const supported = ctorRef.current !== null;

  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const finalRef = useRef('');
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<'denied' | 'error' | null>(null);

  // Latest callbacks without re-creating the recogniser each render.
  const onTranscriptRef = useRef(onTranscript);
  const onFinalRef = useRef(onFinal);
  useEffect(() => { onTranscriptRef.current = onTranscript; onFinalRef.current = onFinal; });

  const stop = useCallback(() => {
    try { recRef.current?.stop(); } catch { /* already stopped */ }
  }, []);

  const start = useCallback(() => {
    const Ctor = ctorRef.current;
    if (!Ctor) return;
    setError(null);
    finalRef.current = '';
    const rec = new Ctor();
    rec.lang = 'en-IE';
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalRef.current += r[0].transcript;
        else interim += r[0].transcript;
      }
      onTranscriptRef.current((finalRef.current + interim).trim());
    };
    rec.onerror = (ev) => {
      setError(ev.error === 'not-allowed' || ev.error === 'service-not-allowed' ? 'denied' : 'error');
      setListening(false);
    };
    rec.onend = () => {
      setListening(false);
      const said = finalRef.current.trim();
      if (said) onFinalRef.current(said);
    };
    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      // start() throws if called twice in a row — treat as a no-op.
      setListening(false);
    }
  }, []);

  // Tidy up if the component unmounts mid-listen.
  useEffect(() => () => { try { recRef.current?.abort(); } catch { /* noop */ } }, []);

  return { supported, listening, error, start, stop };
}
