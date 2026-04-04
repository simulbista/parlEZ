let audioContext = null
let isAudioInitialized = false

const BACKGROUND_TRACK_PATH = `${import.meta.env.BASE_URL}audio/background.mp3`
const BACKGROUND_BASE_VOLUME = 0.09

let backgroundAudio = null
let backgroundTrackUnavailable = false
let interactionListenerAttached = false
let configuredBackgroundVolume = BACKGROUND_BASE_VOLUME
let backgroundSourceNode = null
let backgroundGainNode = null

function applyTrackVolume(value) {
  const normalized = Math.max(0, Math.min(1, Number(value) || 0))

  if (backgroundGainNode && audioContext) {
    backgroundGainNode.gain.setValueAtTime(normalized, audioContext.currentTime)
    return
  }

  if (backgroundAudio) {
    backgroundAudio.volume = normalized
  }
}

function ensureBackgroundRouting(track) {
  const ctx = getAudioContext()

  if (!ctx || !track || backgroundSourceNode) {
    return
  }

  try {
    backgroundSourceNode = ctx.createMediaElementSource(track)
    backgroundGainNode = ctx.createGain()
    backgroundSourceNode.connect(backgroundGainNode)
    backgroundGainNode.connect(ctx.destination)
  } catch (err) {
    console.warn('Could not create media element audio routing:', err)
    backgroundSourceNode = null
    backgroundGainNode = null
  }
}

function attachFirstInteractionRetry() {
  if (interactionListenerAttached) {
    return
  }

  const retryPlay = () => {
    interactionListenerAttached = false
    initializeAudio()
    playBackgroundMusic()
  }

  interactionListenerAttached = true
  window.addEventListener('pointerdown', retryPlay, { once: true })
  window.addEventListener('keydown', retryPlay, { once: true })
  window.addEventListener('touchstart', retryPlay, { once: true })
}

function getAudioContext() {
  if (!audioContext) {
    const AudioContext = window.AudioContext || window.webkitAudioContext
    if (AudioContext) {
      audioContext = new AudioContext()
    }
  }
  return audioContext
}

function resumeAudioContext() {
  const ctx = getAudioContext()
  if (!ctx) return false

  if (ctx.state === 'suspended') {
    ctx.resume().catch((e) => {
      console.warn('Could not resume audio context:', e)
    })
    return false
  }

  return true
}

function getBackgroundAudio() {
  if (backgroundTrackUnavailable) {
    return null
  }

  if (!backgroundAudio) {
    backgroundAudio = new Audio(BACKGROUND_TRACK_PATH)
    backgroundAudio.loop = true
    backgroundAudio.preload = 'auto'

    backgroundAudio.addEventListener('error', () => {
      backgroundTrackUnavailable = true
      console.warn(
        `Background track not found at ${BACKGROUND_TRACK_PATH}. Add your MP3 there.`,
      )
    })

    ensureBackgroundRouting(backgroundAudio)
    applyTrackVolume(configuredBackgroundVolume)
  }

  return backgroundAudio
}

export function initializeAudio() {
  const ctx = getAudioContext()

  if (ctx && ctx.state === 'suspended') {
    ctx.resume().catch((e) => {
      console.warn('Could not resume audio context:', e)
    })
  }

  if (backgroundAudio) {
    ensureBackgroundRouting(backgroundAudio)
    applyTrackVolume(configuredBackgroundVolume)
  }

  isAudioInitialized = true
}

export function playBackgroundMusic() {
  const track = getBackgroundAudio()

  if (!track) {
    return
  }

  ensureBackgroundRouting(track)
  applyTrackVolume(configuredBackgroundVolume)

  if (!track.paused) {
    return
  }

  const playPromise = track.play()

  if (playPromise && typeof playPromise.catch === 'function') {
    playPromise.catch((e) => {
      if (e && e.name === 'NotAllowedError') {
        attachFirstInteractionRetry()
        return
      }

      console.warn('Could not play background track:', e)
    })
  }
}

export function duckBackgroundMusic() {
  const track = getBackgroundAudio()

  if (!track) {
    return
  }

  applyTrackVolume(Math.max(configuredBackgroundVolume * 0.35, 0.02))
}

export function restoreBackgroundMusicVolume() {
  const track = getBackgroundAudio()

  if (!track) {
    return
  }

  applyTrackVolume(configuredBackgroundVolume)
}

export function setBackgroundMusicVolume(value) {
  const numeric = Number(value)

  if (Number.isNaN(numeric)) {
    return
  }

  configuredBackgroundVolume = Math.max(0, Math.min(1, numeric))
  applyTrackVolume(configuredBackgroundVolume)
}

export function getBackgroundMusicVolume() {
  return configuredBackgroundVolume
}

export function stopBackgroundMusic() {
  if (!backgroundAudio) {
    return
  }

  backgroundAudio.pause()
  backgroundAudio.currentTime = 0
}

export function pauseBackgroundMusic() {
  if (!backgroundAudio) {
    return
  }

  backgroundAudio.pause()
}

export function playCorrectSound() {
  try {
    if (!isAudioInitialized) {
      initializeAudio()
    }

    const ctx = getAudioContext()
    if (!ctx) return

    resumeAudioContext()

    const now = ctx.currentTime
    const duration = 0.6

    const notes = [
      { freq: 523, time: 0 },
      { freq: 659, time: 0.15 },
      { freq: 784, time: 0.3 },
    ]

    notes.forEach(({ freq, time }) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      const filter = ctx.createBiquadFilter()

      osc.connect(filter)
      filter.connect(gain)
      gain.connect(ctx.destination)

      osc.frequency.value = freq
      osc.type = 'triangle'

      gain.gain.setValueAtTime(0.3, now + time)
      gain.gain.exponentialRampToValueAtTime(0.01, now + time + duration)

      filter.type = 'lowpass'
      filter.frequency.value = 1000
      filter.Q.value = 2

      osc.start(now + time)
      osc.stop(now + time + duration)
    })
  } catch (err) {
    console.warn('Error playing correct sound:', err)
  }
}

export function playIncorrectSound() {
  try {
    if (!isAudioInitialized) {
      initializeAudio()
    }

    const ctx = getAudioContext()
    if (!ctx) return

    const now = ctx.currentTime
    const duration = 0.7

    const notes = [
      { freq: 349, time: 0, vol: 0.3 },
      { freq: 294, time: 0, vol: 0.28 },
      { freq: 220, time: 0, vol: 0.25 },
      { freq: 262, time: 0.25, vol: 0.32 },
    ]

    notes.forEach(({ freq, time, vol }) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      const filter = ctx.createBiquadFilter()

      osc.connect(filter)
      filter.connect(gain)
      gain.connect(ctx.destination)

      osc.frequency.value = freq
      osc.type = 'sine'

      gain.gain.setValueAtTime(vol, now + time)
      gain.gain.exponentialRampToValueAtTime(0.01, now + time + duration)

      filter.type = 'lowpass'
      filter.frequency.value = 600
      filter.Q.value = 1.5

      osc.start(now + time)
      osc.stop(now + time + duration)
    })
  } catch (err) {
    console.warn('Error playing incorrect sound:', err)
  }
}
