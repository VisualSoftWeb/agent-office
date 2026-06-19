# Voice — Processamento de Voz

A pasta `src/voice/` implementa conversão de fala para texto (STT) e texto para fala (TTS) usando APIs da OpenAI.

---

## speech-to-text.ts — Fala para texto (STT)

- `transcribe()` — transcreve áudio usando Whisper da OpenAI
- Formato de entrada: arquivo OGG
- Provider configurável via `STT_PROVIDER` (padrão: `openai`)
- Remove arquivo temporário após transcrição

---

## text-to-speech.ts — Texto para fala (TTS)

- `synthesize()` — converte texto em áudio MP3
- Usa modelo `tts-1` com voz `alloy`
- Provider configurável via `TTS_PROVIDER` (padrão: `openai`)
- Salva arquivo em `data/tts-<uuid>.mp3`
- Retorna caminho do arquivo gerado
