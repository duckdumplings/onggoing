import { useEffect, useRef, useState } from 'react';

/**
 * Web Speech API(ko-KR) 단발 음성 입력 훅.
 * 인식된 텍스트는 onTranscript로 흘려보내고, 입력 반영은 호출부가 담당한다.
 */
export function useSpeechInput(onTranscript: (text: string) => void) {
  const [isListening, setIsListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const recognitionRef = useRef<any>(null);
  // 콜백을 ref로 보관해 최신 클로저를 쓰되 toggleVoice 동일성을 유지한다.
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setVoiceSupported(Boolean(SpeechRecognition));
    return () => {
      try { recognitionRef.current?.stop?.(); } catch { /* noop */ }
    };
  }, []);

  const toggleVoice = () => {
    if (isListening) {
      try { recognitionRef.current?.stop?.(); } catch { /* noop */ }
      setIsListening(false);
      return;
    }
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    const recognition = new SpeechRecognition();
    recognition.lang = 'ko-KR';
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results)
        .map((r: any) => r[0]?.transcript ?? '')
        .join(' ')
        .trim();
      if (transcript) onTranscriptRef.current(transcript);
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);
    recognitionRef.current = recognition;
    try {
      recognition.start();
      setIsListening(true);
    } catch {
      setIsListening(false);
    }
  };

  return { isListening, voiceSupported, toggleVoice };
}
