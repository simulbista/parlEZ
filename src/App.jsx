import { startTransition, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ExplanationPanel } from './components/ExplanationPanel'
import { OptionCard } from './components/OptionCard'
import vocabBank from './data/vocab.json'
import { useSpeech } from './hooks/useSpeech'
import { buildQuizDeck } from './lib/buildQuizDeck'
import {
  duckBackgroundMusic,
  getBackgroundMusicVolume,
  initializeAudio,
  pauseBackgroundMusic,
  playBackgroundMusic,
  playCorrectSound,
  playIncorrectSound,
  restoreBackgroundMusicVolume,
  setBackgroundMusicVolume,
  stopBackgroundMusic,
} from './lib/audioManager'
import './App.css'

const ROUND_SIZE = 20
const MIN_ROUND_SIZE = 8
const MAX_ROUND_SIZE = 40
const WEAK_WORDS_LIMIT = 8
const PROGRESS_STORAGE_KEY = 'parlez-progress'
const AUDIO_STORAGE_KEY = 'parlez-audio-enabled'
const SETTINGS_STORAGE_KEY = 'parlez-settings'
const CREATOR_SIGNATURE = 'Simul Bista'
const MotionSpan = motion.span
const vocabMap = Object.fromEntries(vocabBank.map((entry) => [entry.id, entry]))

function createRound(progressById = {}, roundSize = ROUND_SIZE, category = 'mixed') {
  let filteredBank = vocabBank
  if (category !== 'mixed') {
    filteredBank = vocabBank.filter(entry => entry.category === category)
  }
  return buildQuizDeck(filteredBank, roundSize, progressById)
}

function getInitialTheme() {
  if (typeof window === 'undefined') {
    return 'dark'
  }

  return window.localStorage.getItem('parlez-theme') || 'dark'
}

function getInitialProgress() {
  if (typeof window === 'undefined') {
    return {
      terms: {},
      currentStreak: 0,
      bestStreak: 0,
    }
  }

  try {
    const raw = window.localStorage.getItem(PROGRESS_STORAGE_KEY)

    if (!raw) {
      return {
        terms: {},
        currentStreak: 0,
        bestStreak: 0,
      }
    }

    const parsed = JSON.parse(raw)

    return {
      terms: parsed.terms || {},
      currentStreak: Number(parsed.currentStreak || 0),
      bestStreak: Number(parsed.bestStreak || 0),
    }
  } catch {
    return {
      terms: {},
      currentStreak: 0,
      bestStreak: 0,
    }
  }
}

function getInitialAudioEnabled() {
  if (typeof window === 'undefined') {
    return true
  }

  const saved = window.localStorage.getItem(AUDIO_STORAGE_KEY)

  if (saved === null) {
    return true
  }

  return saved === 'true'
}

function getInitialSettings() {
  if (typeof window === 'undefined') {
    return {
      roundSize: ROUND_SIZE,
      backgroundVolume: getBackgroundMusicVolume(),
      category: 'mixed',
    }
  }

  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY)

    if (!raw) {
      return {
        roundSize: ROUND_SIZE,
        backgroundVolume: getBackgroundMusicVolume(),
        category: 'mixed',
      }
    }

    const parsed = JSON.parse(raw)
    const nextRoundSize = Number(parsed.roundSize || ROUND_SIZE)
    const nextVolume = Number(
      parsed.backgroundVolume ?? getBackgroundMusicVolume(),
    )
    const nextCategory = parsed.category || 'mixed'

    return {
      roundSize: Math.max(MIN_ROUND_SIZE, Math.min(MAX_ROUND_SIZE, nextRoundSize)),
      backgroundVolume: Math.max(0, Math.min(1, nextVolume)),
      category: nextCategory,
    }
  } catch {
    return {
      roundSize: ROUND_SIZE,
      backgroundVolume: getBackgroundMusicVolume(),
      category: 'mixed',
    }
  }
}

function App() {
  const initialSettings = getInitialSettings()
  const [theme, setTheme] = useState(getInitialTheme)
  const [themeTransition, setThemeTransition] = useState(false)
  const [audioEnabled, setAudioEnabled] = useState(getInitialAudioEnabled)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [weakPaneOpen, setWeakPaneOpen] = useState(false)
  const [settingsSpinKey, setSettingsSpinKey] = useState(0)
  const [roundSize, setRoundSize] = useState(initialSettings.roundSize)
  const [backgroundVolume, setBackgroundVolume] = useState(
    initialSettings.backgroundVolume,
  )
  const [category, setCategory] = useState(initialSettings.category)
  const [progressData, setProgressData] = useState(getInitialProgress)
  const [deck, setDeck] = useState(() =>
    createRound(getInitialProgress().terms, initialSettings.roundSize, initialSettings.category),
  )
  const [questionIndex, setQuestionIndex] = useState(0)
  const [selectedOptionId, setSelectedOptionId] = useState(null)
  const [expandedOptionId, setExpandedOptionId] = useState(null)
  const [score, setScore] = useState(0)
  const [canAdvance, setCanAdvance] = useState(false)
  const { speak, stop, speakingId, speechSupported } = useSpeech()

  const sessionComplete = questionIndex >= deck.length
  const currentQuestion = sessionComplete ? null : deck[questionIndex]
  const answered = selectedOptionId !== null
  const questionAudioId = currentQuestion ? `question-${currentQuestion.id}` : null
  const progressValue = sessionComplete
    ? 100
    : ((questionIndex + (answered ? 1 : 0)) / deck.length) * 100

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    window.localStorage.setItem('parlez-theme', theme)
  }, [theme])

  useEffect(() => {
    window.localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(progressData))
  }, [progressData])

  useEffect(() => {
    window.localStorage.setItem(AUDIO_STORAGE_KEY, String(audioEnabled))
  }, [audioEnabled])

  useEffect(() => {
    setBackgroundMusicVolume(backgroundVolume)
    window.localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ roundSize, backgroundVolume, category }),
    )
  }, [roundSize, backgroundVolume, category])

  useEffect(() => {
    startTransition(() => {
      setDeck(createRound(progressData.terms, roundSize, category))
      setQuestionIndex(0)
      setSelectedOptionId(null)
      setExpandedOptionId(null)
      setScore(0)
      setCanAdvance(false)
    })
  }, [category, roundSize])

  useEffect(() => {
    return () => {
      stopBackgroundMusic()
    }
  }, [])

  useEffect(() => {
    if (audioEnabled) {
      const timer = setTimeout(() => {
        playBackgroundMusic()
        if (sessionComplete) {
          // Increase volume by 10% on result screen
          setBackgroundMusicVolume(backgroundVolume * 1.1)
        }
      }, 100)

      return () => {
        clearTimeout(timer)
      }
    }

    stopBackgroundMusic()
  }, [audioEnabled, sessionComplete, backgroundVolume])

  useEffect(() => {
    if (!audioEnabled || sessionComplete) {
      return
    }

    if (answered) {
      duckBackgroundMusic()
      return
    }

    restoreBackgroundMusicVolume()
  }, [audioEnabled, sessionComplete, answered, questionIndex])

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        pauseBackgroundMusic()
        return
      }

      if (!audioEnabled || sessionComplete) {
        return
      }

      if (answered) {
        duckBackgroundMusic()
      } else {
        restoreBackgroundMusicVolume()
      }

      playBackgroundMusic()
    }

    const handlePageHide = () => {
      pauseBackgroundMusic()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('pagehide', handlePageHide)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('pagehide', handlePageHide)
    }
  }, [audioEnabled, sessionComplete, answered])

  const toggleTheme = () => {
    setThemeTransition(true)
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'))
  }

  useEffect(() => {
    if (themeTransition) {
      const timer = setTimeout(() => {
        setThemeTransition(false)
      }, 900)
      return () => clearTimeout(timer)
    }
  }, [themeTransition])

  const themeLabel =
    theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
  const audioLabel = audioEnabled ? 'Mute sound' : 'Enable sound'
  const settingsLabel = settingsOpen ? 'Close settings' : 'Open settings'
  const attemptedQuestions = questionIndex + (answered ? 1 : 0)
  const liveAccuracy = attemptedQuestions
    ? Math.round((score / attemptedQuestions) * 100)
    : 0

  const rankedWeakTerms = Object.entries(progressData.terms)
    .map(([id, stats]) => {
      const incorrect = Number(stats.incorrect || 0)
      const correct = Number(stats.correct || 0)
      const attempts = incorrect + correct

      if (!attempts || !vocabMap[id] || incorrect <= 0) {
        return null
      }

      return {
        id,
        french: vocabMap[id].terms[0],
        english: vocabMap[id].english,
        attempts,
        incorrect,
        errorRate: incorrect / attempts,
      }
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (b.incorrect !== a.incorrect) {
        return b.incorrect - a.incorrect
      }

      if (b.errorRate !== a.errorRate) {
        return b.errorRate - a.errorRate
      }

      return a.english.localeCompare(b.english)
    })

  const topWeakTerms = rankedWeakTerms.slice(0, WEAK_WORDS_LIMIT)
  const weakTerms = topWeakTerms

  const toggleAudio = () => {
    setAudioEnabled((current) => {
      const next = !current

      if (next) {
        initializeAudio()
        restoreBackgroundMusicVolume()

        if (!answered && !sessionComplete) {
          playBackgroundMusic()
        }
      } else {
        stopBackgroundMusic()
      }

      return next
    })
  }

  const toggleSettings = () => {
    setSettingsOpen((current) => !current)
  }

  const handleSettingsIconClick = () => {
    setSettingsSpinKey((current) => current + 1)
    toggleSettings()
  }

  const toggleWeakPane = () => {
    if (!rankedWeakTerms.length) {
      return
    }

    if (weakPaneOpen) {
      setWeakPaneOpen(false)
      return
    }

    setWeakPaneOpen(true)
  }

  const clearWeakWord = (id) => {

    setProgressData((current) => {
      const existing = current.terms[id]

      if (!existing || Number(existing.incorrect || 0) <= 0) {
        return current
      }

      const nextTerms = {
        ...current.terms,
      }

      const hasCorrectHistory = Number(existing.correct || 0) > 0

      if (hasCorrectHistory) {
        nextTerms[id] = {
          ...existing,
          incorrect: 0,
          lastOutcome:
            existing.lastOutcome === 'incorrect' ? 'correct' : existing.lastOutcome,
        }
      } else {
        delete nextTerms[id]
      }

      return {
        ...current,
        terms: nextTerms,
      }
    })
  }

  const clearAllWeakWords = () => {
    setProgressData((current) => {
      const nextTerms = {
        ...current.terms,
      }
      let changed = false

      Object.entries(current.terms).forEach(([id, stats]) => {
        const incorrect = Number(stats?.incorrect || 0)

        if (incorrect <= 0) {
          return
        }

        const hasCorrectHistory = Number(stats?.correct || 0) > 0

        if (hasCorrectHistory) {
          nextTerms[id] = {
            ...stats,
            incorrect: 0,
            lastOutcome:
              stats.lastOutcome === 'incorrect' ? 'correct' : stats.lastOutcome,
          }
        } else {
          delete nextTerms[id]
        }

        changed = true
      })

      if (!changed) {
        return current
      }

      return {
        ...current,
        terms: nextTerms,
      }
    })
  }

  const handleRoundSizeChange = (event) => {
    const next = Number(event.target.value)
    setRoundSize(Math.max(MIN_ROUND_SIZE, Math.min(MAX_ROUND_SIZE, next)))
  }

  const handleVolumeChange = (event) => {
    const next = Number(event.target.value)
    setBackgroundVolume(Math.max(0, Math.min(1, next)))
  }

  const resetRound = () => {
    stop()
    setSettingsOpen(false)

    startTransition(() => {
      setDeck(createRound(progressData.terms, roundSize, category))
      setQuestionIndex(0)
      setSelectedOptionId(null)
      setExpandedOptionId(null)
      setScore(0)
      setCanAdvance(false)
    })
  }

  const handleOptionAction = (optionId) => {
    if (sessionComplete) {
      return
    }

    if (answered) {
      setExpandedOptionId((current) => (current === optionId ? null : optionId))
      return
    }

    initializeAudio()

    const isCorrect = optionId === currentQuestion.answerId

    setSelectedOptionId(optionId)
    setExpandedOptionId(optionId)
    duckBackgroundMusic()

    if (isCorrect) {
      playCorrectSound()
      setScore((current) => current + 1)
    } else {
      playIncorrectSound()
    }

    setProgressData((current) => {
      // For fill-in-the-blank questions, track progress for the source entry, not the term
      const progressKey = currentQuestion.entryType === 'Fill in the blank' 
        ? currentQuestion.id.split('-')[0]  // Extract entry ID from question ID
        : currentQuestion.answerId

      const existingTerm = current.terms[progressKey] || {
        correct: 0,
        incorrect: 0,
        lastOutcome: null,
        lastSeenAt: 0,
      }

      const nextTerm = {
        ...existingTerm,
        correct: existingTerm.correct + (isCorrect ? 1 : 0),
        incorrect: existingTerm.incorrect + (isCorrect ? 0 : 1),
        lastOutcome: isCorrect ? 'correct' : 'incorrect',
        lastSeenAt: Date.now(),
      }

      const currentStreak = isCorrect ? current.currentStreak + 1 : 0
      const bestStreak = Math.max(current.bestStreak, currentStreak)

      return {
        terms: {
          ...current.terms,
          [progressKey]: nextTerm,
        },
        currentStreak,
        bestStreak,
      }
    })
  }

  const handleNext = () => {
    if (!answered || sessionComplete) {
      return
    }

    initializeAudio()
    stop()
    restoreBackgroundMusicVolume()

    startTransition(() => {
      setSelectedOptionId(null)
      setExpandedOptionId(null)
      setQuestionIndex((current) => current + 1)
    })
  }

  const handleAudio = (entry) => {
    if (!speechSupported) {
      return
    }

    if (speakingId === entry.id) {
      stop()
      return
    }

    speak(entry.id, entry.exampleFrench)
  }

  if (sessionComplete) {
    const percentage = Math.round((score / deck.length) * 100)

    return (
      <>
        {themeTransition && (
          <motion.div
            className="theme-transition-overlay"
            data-theme={theme === 'dark' ? 'to-dark' : 'to-light'}
            initial={{ x: '-100%' }}
            animate={{ x: '100%' }}
            transition={{ duration: 0.9, ease: 'easeInOut' }}
            onAnimationComplete={() => setThemeTransition(false)}
          />
        )}
        <main className="app-shell">
        <section className="hero-card hero-card--summary">
          <p className="eyebrow">ParlEZ practice recap</p>
          <h1>Round complete.</h1>
          <p className="hero-copy">
            You answered {score} of {deck.length} questions correctly. The bank still
            holds {vocabBank.length} French terms, so every reshuffle gives you a new
            mix of prompts and distractors.
          </p>

          <div className="summary-strip">
            <div>
              <span className="summary-label">Accuracy</span>
              <strong>{percentage}%</strong>
            </div>
            <div>
              <span className="summary-label">Round size</span>
              <strong>{deck.length} cards</strong>
            </div>
            <div>
              <span className="summary-label">Vocab bank</span>
              <strong>{vocabBank.length} entries</strong>
            </div>
            <div>
              <span className="summary-label">Best streak</span>
              <strong>{progressData.bestStreak}</strong>
            </div>
          </div>

          <div className="hero-actions">
            <button
              className="secondary-button icon-button"
              onClick={handleSettingsIconClick}
              aria-label={settingsLabel}
              title={settingsLabel}
            >
              <motion.svg
                key={`settings-summary-${settingsSpinKey}`}
                viewBox="0 0 24 24"
                aria-hidden="true"
                initial={{ rotate: 0, scale: 1 }}
                animate={{ rotate: [0, 220, 360], scale: [1, 1.06, 1] }}
                transition={{ duration: 0.55, ease: 'easeInOut' }}
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.65 1.65 0 0 0 15 19.4a1.65 1.65 0 0 0-1 .6 1.65 1.65 0 0 0-.33 1V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-.33-1 1.65 1.65 0 0 0-1-.6 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-.6-1 1.65 1.65 0 0 0-1-.33H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1-.33 1.65 1.65 0 0 0 .6-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-.6 1.65 1.65 0 0 0 .33-1V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 .33 1 1.65 1.65 0 0 0 1 .6 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.24.3.44.64.6 1a1.65 1.65 0 0 0 1 .33H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1 .33 1.65 1.65 0 0 0-.51.34z" />
              </motion.svg>
            </button>
            <button
              className="secondary-button icon-button"
              onClick={toggleAudio}
              aria-label={audioLabel}
              title={audioLabel}
            >
              {audioEnabled ? (
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M5 9v6h4l5 4V5L9 9H5z" />
                  <path d="M16 9a5 5 0 0 1 0 6" />
                  <path d="M18.5 6.5a8.5 8.5 0 0 1 0 11" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M5 9v6h4l5 4V5L9 9H5z" />
                  <path d="M18 9l-6 6" />
                  <path d="M12 9l6 6" />
                </svg>
              )}
            </button>
            <button
              className="secondary-button theme-toggle icon-button"
              onClick={toggleTheme}
              aria-label={themeLabel}
              title={themeLabel}
            >
              <motion.svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                key={theme}
                initial={{ opacity: 0, rotate: theme === 'dark' ? -180 : 180 }}
                animate={{ opacity: 1, rotate: 0 }}
                exit={{ opacity: 0, rotate: theme === 'dark' ? 180 : -180 }}
                transition={{ duration: 0.5, ease: 'easeInOut' }}
              >
                {theme === 'dark' ? (
                  <>
                    <circle cx="12" cy="12" r="4" />
                    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
                  </>
                ) : (
                  <path d="M21 12.79A9 9 0 1 1 11.21 3c-.11.56-.16 1.14-.16 1.73a7 7 0 0 0 8.95 6.7z" />
                )}
              </motion.svg>
            </button>
            <button className="primary-button" onClick={resetRound}>
              Shuffle a new round
            </button>
          </div>
        </section>

        <section
          className={`settings-drawer ${settingsOpen ? 'is-open' : ''}`}
          aria-label="Practice settings"
          aria-hidden={!settingsOpen}
        >
          <div className="settings-drawer-inner">
            <div className="settings-row">
              <label htmlFor="round-size">Round size</label>
              <input
                id="round-size"
                type="range"
                min="8"
                max="40"
                step="1"
                value={roundSize}
                onChange={handleRoundSizeChange}
              />
              <strong>{roundSize}</strong>
            </div>
            <div className="settings-row">
              <label htmlFor="bg-volume">Music volume</label>
              <input
                id="bg-volume"
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={backgroundVolume}
                onChange={handleVolumeChange}
              />
              <strong>{Math.round(backgroundVolume * 100)}%</strong>
            </div>
            <div className="settings-row">
              <label htmlFor="category">Category</label>
              <select
                id="category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="mixed">Mixed</option>
                <option value="vocab">Vocabulary</option>
                <option value="connectors">Connectors</option>
                <option value="pronoms relatifs">Pronoms relatifs</option>
              </select>
            </div>
          </div>
        </section>
        <p className="signature-note">Made by {CREATOR_SIGNATURE}</p>
      </main>
      </>
    )
  }

  const answerEntry = currentQuestion.entryType === 'Fill in the blank' 
    ? { english: currentQuestion.answerId, terms: [currentQuestion.answerId] }
    : vocabMap[currentQuestion.answerId]
  const questionAudioLabel = speechSupported
    ? speakingId === questionAudioId
      ? 'Stop question pronunciation'
      : 'Play question pronunciation'
    : 'Speech not supported in this browser'

  return (
    <>
      {themeTransition && (
        <motion.div
          className="theme-transition-overlay"
          data-theme={theme === 'dark' ? 'to-dark' : 'to-light'}
          initial={{ x: '-100%' }}
          animate={{ x: '100%' }}
          transition={{ duration: 0.9, ease: 'easeInOut' }}
          onAnimationComplete={() => setThemeTransition(false)}
        />
      )}
      <main className="app-shell">
        <section className="hero-card hero-card--top">
        <div>
          <p className="eyebrow">French vocab practice for English speakers</p>
          <div className="brand-row">
            <h1 className="brand-title">
              <span className="brand-word">ParlEZ</span>
              <span className="brand-flag" aria-hidden="true" />
            </h1>
            <p className="signature-note signature-note--mobile">
              Made by {CREATOR_SIGNATURE}
            </p>
          </div>
          <p className="hero-copy">
            Answer once, then tap any card to roll open the French meaning, usage
            example, and audio.
          </p>
        </div>

        <div className="hero-meta">
          <div className="meta-pill">
            <span>Bank</span>
            <strong>{vocabBank.length}</strong>
          </div>
          <div className="meta-pill">
            <span>Round</span>
            <strong>{roundSize}</strong>
          </div>
          <div className="meta-pill">
            <span>Category</span>
            <strong>{category === 'mixed' ? 'Mixed' : category === 'vocab' ? 'Vocab' : category === 'connectors' ? 'Connectors' : 'Pronoms'}</strong>
          </div>
        </div>
      </section>

      <section className="stats-panel" aria-label="Learning stats">
        <div className="stats-pill">
          <span>Score</span>
          <strong>
            {attemptedQuestions ? `${score}/${attemptedQuestions}` : '0'}
          </strong>
        </div>
        <div className="stats-pill">
          <span>Accuracy</span>
          <strong>{liveAccuracy}%</strong>
        </div>
        <div className="stats-pill">
          <span>Attempts</span>
          <strong>{attemptedQuestions}</strong>
        </div>
        <div className="stats-pill">
          <span>Streak</span>
          <strong>
            {progressData.currentStreak} (best {progressData.bestStreak})
          </strong>
        </div>
        <button
          type="button"
          className="stats-pill stats-pill--toughest stats-pill-toggle"
          onClick={toggleWeakPane}
          disabled={!weakTerms.length}
          aria-expanded={weakPaneOpen}
          aria-controls="weak-terms-pane"
        >
          <span>Review weak words</span>
          <strong>
            {weakPaneOpen ? 'Hide list' : `Open list (${weakTerms.length})`}
          </strong>
        </button>
      </section>

      <section
        id="weak-terms-pane"
        className={`weak-terms-pane ${weakPaneOpen ? 'is-open' : ''}`}
        onClick={() => {
          if (weakPaneOpen) {
            setWeakPaneOpen(false)
          }
        }}
      >
        <div
          className="weak-terms-inner"
          onClick={(event) => {
            event.stopPropagation()
          }}
        >
          {weakTerms.length ? (
            <>
              <div className="weak-terms-actions">
                <button
                  className="ghost-button weak-terms-clear-all"
                  onClick={clearAllWeakWords}
                >
                  Clear all weak words
                </button>
              </div>
              <ul className="weak-terms-list">
                <AnimatePresence initial={false}>
                  {weakTerms.map((term) => (
                    <motion.li
                      key={term.id}
                      layout
                      initial={{ opacity: 0, y: 8, scale: 0.985 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -10, scale: 0.97 }}
                      transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
                    >
                      <div className="weak-term-copy">
                        <span className="weak-term-fr">{term.french}</span>
                        <span className="weak-term-en">{term.english}</span>
                      </div>
                      <button
                        className="ghost-button weak-term-clear"
                        aria-label={`Delete ${term.french}`}
                        title={`Delete ${term.french}`}
                        onClick={() => {
                          clearWeakWord(term.id)
                        }}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M6 9v10c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V9" />
                          <path d="M9 5c0-.6.4-1 1-1h4c.6 0 1 .4 1 1" />
                          <path d="M4 9h16" />
                          <path d="M10 12v6" />
                          <path d="M14 12v6" />
                        </svg>
                      </button>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            </>
          ) : (
            <p className="weak-terms-empty">
              No weak terms yet. Keep practicing and this list will update.
            </p>
          )}
        </div>
      </section>

      <section
        className={`quiz-card ${expandedOptionId !== null ? 'is-option-expanded' : ''}`}
      >
        <div className="quiz-header">
          <div>
            <p className="question-step">
              Question {questionIndex + 1} of {deck.length}
            </p>
          </div>
          <div className="header-actions">
            <button
              className="secondary-button icon-button"
              onClick={handleSettingsIconClick}
              aria-label={settingsLabel}
              title={settingsLabel}
            >
              <motion.svg
                key={`settings-quiz-${settingsSpinKey}`}
                viewBox="0 0 24 24"
                aria-hidden="true"
                initial={{ rotate: 0, scale: 1 }}
                animate={{ rotate: [0, 220, 360], scale: [1, 1.06, 1] }}
                transition={{ duration: 0.55, ease: 'easeInOut' }}
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.65 1.65 0 0 0 15 19.4a1.65 1.65 0 0 0-1 .6 1.65 1.65 0 0 0-.33 1V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-.33-1 1.65 1.65 0 0 0-1-.6 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-.6-1 1.65 1.65 0 0 0-1-.33H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1-.33 1.65 1.65 0 0 0 .6-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-.6 1.65 1.65 0 0 0 .33-1V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 .33 1 1.65 1.65 0 0 0 1 .6 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.24.3.44.64.6 1a1.65 1.65 0 0 0 1 .33H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1 .33 1.65 1.65 0 0 0-.51.34z" />
              </motion.svg>
            </button>
            <button
              className="secondary-button icon-button"
              onClick={toggleAudio}
              aria-label={audioLabel}
              title={audioLabel}
            >
              {audioEnabled ? (
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M5 9v6h4l5 4V5L9 9H5z" />
                  <path d="M16 9a5 5 0 0 1 0 6" />
                  <path d="M18.5 6.5a8.5 8.5 0 0 1 0 11" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M5 9v6h4l5 4V5L9 9H5z" />
                  <path d="M18 9l-6 6" />
                  <path d="M12 9l6 6" />
                </svg>
              )}
            </button>
            <button
              className="secondary-button theme-toggle icon-button"
              onClick={toggleTheme}
              aria-label={themeLabel}
              title={themeLabel}
            >
              {theme === 'dark' ? (
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3c-.11.56-.16 1.14-.16 1.73a7 7 0 0 0 8.95 6.7z" />
                </svg>
              )}
            </button>
          </div>
        </div>

        <section
          className={`settings-drawer ${settingsOpen ? 'is-open' : ''}`}
          aria-label="Practice settings"
          aria-hidden={!settingsOpen}
        >
          <div className="settings-drawer-inner">
            <div className="settings-row">
              <label htmlFor="round-size">Round size</label>
              <input
                id="round-size"
                type="range"
                min="8"
                max="40"
                step="1"
                value={roundSize}
                onChange={handleRoundSizeChange}
              />
              <strong>{roundSize}</strong>
            </div>
            <div className="settings-row">
              <label htmlFor="bg-volume">Music volume</label>
              <input
                id="bg-volume"
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={backgroundVolume}
                onChange={handleVolumeChange}
              />
              <strong>{Math.round(backgroundVolume * 100)}%</strong>
            </div>
            <div className="settings-row">
              <label htmlFor="category">Category</label>
              <select
                id="category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="mixed">Mixed</option>
                <option value="vocab">Vocabulary</option>
                <option value="connectors">Connectors</option>
                <option value="pronoms relatifs">Pronoms relatifs</option>
              </select>
            </div>
          </div>
        </section>

        <div className="progress-track" aria-hidden="true">
          <MotionSpan
            className="progress-fill"
            initial={false}
            animate={{ width: `${progressValue}%` }}
            transition={{ duration: 0.45, ease: 'easeOut' }}
          />
        </div>

        <div className="quiz-main-grid">
          <header className="question-card">
            <div className="question-header">
              <div className="question-phrase-row">
                <p className="question-phrase">{currentQuestion.promptTerm}</p>
                {currentQuestion.entryType === 'Fill in the blank' && currentQuestion.blankType && (
                  <p className="question-blank-type">({currentQuestion.blankType})</p>
                )}
                <button
                  className="ghost-button icon-button audio-icon-button"
                  onClick={() => {
                    if (speakingId === questionAudioId) {
                      stop()
                      return
                    }

                    speak(questionAudioId, currentQuestion.promptTerm)
                  }}
                  disabled={!speechSupported}
                  aria-label={questionAudioLabel}
                  title={questionAudioLabel}
                >
                  {speakingId === questionAudioId ? (
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M6 6h12v12H6z" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M5 9v6h4l5 4V5L9 9H5z" />
                      <path d="M16 9a5 5 0 0 1 0 6" />
                      <path d="M18.5 6.5a8.5 8.5 0 0 1 0 11" />
                    </svg>
                  )}
                </button>
              </div>
              <span className="question-type">{currentQuestion.entryType}</span>
            </div>
          </header>

          <div className="options-grid">
            {currentQuestion.optionIds.map((optionId, optionIndex) => {
              const entry = currentQuestion.entryType === 'Fill in the blank'
                ? currentQuestion.options.find(opt => opt.english === optionId)
                : vocabMap[optionId]

              return (
                <OptionCard
                  key={optionId}
                  entry={entry}
                  index={optionIndex}
                  answered={answered}
                  expanded={expandedOptionId === optionId}
                  isCorrect={answered && optionId === currentQuestion.answerId}
                  isSelected={selectedOptionId === optionId}
                  onAction={() => handleOptionAction(optionId)}
                >
                  <ExplanationPanel
                    entry={entry}
                    speechSupported={speechSupported}
                    speaking={speakingId === entry.id}
                    onAudio={() => handleAudio(entry)}
                  />
                </OptionCard>
              )
            })}
          </div>
        </div>

      </section>

      <div className="footer-bar">
        {answered ? (
          <p className="footer-copy">{`Correct answer: ${answerEntry.english}.`}</p>
        ) : null}

        <button
          className="primary-button"
          onClick={handleNext}
          disabled={!answered}
        >
          {questionIndex === deck.length - 1 ? 'Finish round' : 'Next question'}
        </button>
      </div>
      <p className="signature-note signature-note--footer">Made by {CREATOR_SIGNATURE}</p>
    </main>
    </>
  )
}

export default App
