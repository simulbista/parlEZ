import { useEffect, useState } from 'react'

function selectFrenchVoice(voices) {
  return voices.find((voice) => voice.lang.toLowerCase().startsWith('fr'))
}

export function useSpeech() {
  const [speechSupported, setSpeechSupported] = useState(false)
  const [voices, setVoices] = useState([])
  const [speakingId, setSpeakingId] = useState(null)

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return undefined
    }

    const updateVoices = () => {
      setVoices(window.speechSynthesis.getVoices())
      setSpeechSupported(true)
    }

    updateVoices()
    window.speechSynthesis.addEventListener('voiceschanged', updateVoices)

    return () => {
      window.speechSynthesis.cancel()
      window.speechSynthesis.removeEventListener('voiceschanged', updateVoices)
    }
  }, [])

  const stop = () => {
    if (!speechSupported) {
      return
    }

    window.speechSynthesis.cancel()
    setSpeakingId(null)
  }

  const speak = (id, text) => {
    if (!speechSupported) {
      return
    }

    window.speechSynthesis.cancel()

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'fr-FR'
    utterance.rate = 0.92
    utterance.pitch = 1

    const preferredVoice = selectFrenchVoice(voices)

    if (preferredVoice) {
      utterance.voice = preferredVoice
    }

    utterance.onend = () => setSpeakingId(null)
    utterance.onerror = () => setSpeakingId(null)

    setSpeakingId(id)
    window.speechSynthesis.speak(utterance)
  }

  return {
    speak,
    speakingId,
    speechSupported,
    stop,
  }
}