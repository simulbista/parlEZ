import { startTransition, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { ExplanationPanel } from './components/ExplanationPanel'
import { OptionCard } from './components/OptionCard'
import vocabBank from './data/vocab.json'
import { useSpeech } from './hooks/useSpeech'
import { buildQuizDeck } from './lib/buildQuizDeck'
import {
  duckBackgroundMusic,
  getBackgroundMusicVolume,
  initializeAudio,
  playBackgroundMusic,
  playCorrectSound,
  playIncorrectSound,
  restoreBackgroundMusicVolume,
  setBackgroundMusicVolume,
  stopBackgroundMusic,
} from './lib/audioManager'
import './App.css'

const ROUND_SIZE = 20
const PROGRESS_STORAGE_KEY = 'parlez-progress'
const AUDIO_STORAGE_KEY = 'parlez-audio-enabled'
const SETTINGS_STORAGE_KEY = 'parlez-settings'
const MotionSpan = motion.span
const vocabMap = Object.fromEntries(vocabBank.map((entry) => [entry.id, entry]))

function createRound(progressById = {}, roundSize = ROUND_SIZE) {
  return buildQuizDeck(vocabBank, roundSize, progressById)
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
    }
  }

  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY)

    if (!raw) {
      return {
        roundSize: ROUND_SIZE,
        backgroundVolume: getBackgroundMusicVolume(),
      }
    }

    const parsed = JSON.parse(raw)
    const nextRoundSize = Number(parsed.roundSize || ROUND_SIZE)
    const nextVolume = Number(
      parsed.backgroundVolume ?? getBackgroundMusicVolume(),
    )

    return {
      roundSize: Math.max(8, Math.min(40, nextRoundSize)),
      backgroundVolume: Math.max(0, Math.min(1, nextVolume)),
    }
  } catch {
    return {
      roundSize: ROUND_SIZE,
      backgroundVolume: getBackgroundMusicVolume(),
    }
  }
}

function App() {
  const initialSettings = getInitialSettings()
  const [theme, setTheme] = useState(getInitialTheme)
  const [audioEnabled, setAudioEnabled] = useState(getInitialAudioEnabled)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [weakPaneOpen, setWeakPaneOpen] = useState(false)
  const [roundSize, setRoundSize] = useState(initialSettings.roundSize)
  const [backgroundVolume, setBackgroundVolume] = useState(
    initialSettings.backgroundVolume,
  )
  const [progressData, setProgressData] = useState(getInitialProgress)
  const [deck, setDeck] = useState(() =>
    createRound(getInitialProgress().terms, initialSettings.roundSize),
  )
  const [questionIndex, setQuestionIndex] = useState(0)
  const [selectedOptionId, setSelectedOptionId] = useState(null)
  const [expandedOptionId, setExpandedOptionId] = useState(null)
  const [score, setScore] = useState(0)
  const { speak, stop, speakingId, speechSupported } = useSpeech()

  const sessionComplete = questionIndex >= deck.length
  const currentQuestion = sessionComplete ? null : deck[questionIndex]
  const answered = selectedOptionId !== null
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
      JSON.stringify({ roundSize, backgroundVolume }),
    )
  }, [roundSize, backgroundVolume])

  useEffect(() => {
    return () => {
      stopBackgroundMusic()
    }
  }, [])

  useEffect(() => {
    if (audioEnabled && !sessionComplete) {
      const timer = setTimeout(() => {
        playBackgroundMusic()
      }, 100)

      return () => {
        clearTimeout(timer)
      }
    }

    stopBackgroundMusic()
  }, [audioEnabled, sessionComplete])

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

  const toggleTheme = () => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'))
  }

  const themeLabel =
    theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
  const audioLabel = audioEnabled ? 'Mute sound' : 'Enable sound'
  const settingsLabel = settingsOpen ? 'Close settings' : 'Open settings'
  const attemptedQuestions = questionIndex + (answered ? 1 : 0)
  const liveAccuracy = attemptedQuestions
    ? Math.round((score / attemptedQuestions) * 100)
    : 0

  const weakTerms = Object.entries(progressData.terms)
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
    .slice(0, 7)

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

  const toggleWeakPane = () => {
    setWeakPaneOpen((current) => !current)
  }

  const handleRoundSizeChange = (event) => {
    const next = Number(event.target.value)
    setRoundSize(Math.max(8, Math.min(40, next)))
  }

  const handleVolumeChange = (event) => {
    const next = Number(event.target.value)
    setBackgroundVolume(Math.max(0, Math.min(1, next)))
  }

  const resetRound = () => {
    stop()

    startTransition(() => {
      setDeck(createRound(progressData.terms, roundSize))
      setQuestionIndex(0)
      setSelectedOptionId(null)
      setExpandedOptionId(null)
      setScore(0)
    })
  }

  const applySettingsAndReshuffle = () => {
    setSettingsOpen(false)
    resetRound()
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
      const existingTerm = current.terms[currentQuestion.answerId] || {
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
          [currentQuestion.answerId]: nextTerm,
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
              onClick={toggleSettings}
              aria-label={settingsLabel}
              title={settingsLabel}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.65 1.65 0 0 0 15 19.4a1.65 1.65 0 0 0-1 .6 1.65 1.65 0 0 0-.33 1V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-.33-1 1.65 1.65 0 0 0-1-.6 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-.6-1 1.65 1.65 0 0 0-1-.33H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1-.33 1.65 1.65 0 0 0 .6-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-.6 1.65 1.65 0 0 0 .33-1V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 .33 1 1.65 1.65 0 0 0 1 .6 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.24.3.44.64.6 1a1.65 1.65 0 0 0 1 .33H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1 .33 1.65 1.65 0 0 0-.51.34z" />
              </svg>
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
            <button className="primary-button" onClick={resetRound}>
              Shuffle a new round
            </button>
          </div>
        </section>
      </main>
    )
  }

  const answerEntry = vocabMap[currentQuestion.answerId]

  return (
    <main className="app-shell">
      <section className="hero-card hero-card--top">
        <div>
          <p className="eyebrow">French vocab practice for English speakers</p>
          <h1 className="brand-title">
            ParlEZ <span className="brand-flag" aria-hidden="true" />
          </h1>
          <p className="hero-copy">
            Answer once, then tap any card to roll open the French meaning, usage
            example, and audio.
          </p>
        </div>

        <div className="hero-meta">
          <div className="meta-pill">
            <span>Loaded bank</span>
            <strong>{vocabBank.length} entries</strong>
          </div>
          <div className="meta-pill">
            <span>Session</span>
            <strong>{roundSize}-question round</strong>
          </div>
          <div className="meta-pill">
            <span>Score</span>
            <strong>
              {score}/{Math.max(questionIndex, 0)}
            </strong>
          </div>
          <div className="meta-pill">
            <span>Streak</span>
            <strong>
              {progressData.currentStreak} (best {progressData.bestStreak})
            </strong>
          </div>
        </div>
      </section>

      <section className="stats-panel" aria-label="Learning stats">
        <div className="stats-pill">
          <span>Session accuracy</span>
          <strong>{liveAccuracy}%</strong>
        </div>
        <div className="stats-pill">
          <span>Attempted this round</span>
          <strong>{attemptedQuestions}</strong>
        </div>
        <div className="stats-pill stats-pill--toughest">
          <span>Review weak words</span>
          <button
            className="secondary-button"
            onClick={toggleWeakPane}
            disabled={!weakTerms.length}
          >
            {weakPaneOpen ? 'Hide list' : `Open list (${weakTerms.length})`}
          </button>
        </div>
      </section>

      <section
        className={`weak-terms-pane ${weakPaneOpen ? 'is-open' : ''}`}
        onClick={() => {
          if (weakPaneOpen) {
            setWeakPaneOpen(false)
          }
        }}
      >
        <div className="weak-terms-inner">
          {weakTerms.length ? (
            <ul className="weak-terms-list">
              {weakTerms.map((term) => (
                <li key={term.id}>
                  <span className="weak-term-fr">{term.french}</span>
                  <span className="weak-term-en">{term.english}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="weak-terms-empty">
              No weak terms yet. Keep practicing and this list will update.
            </p>
          )}
        </div>
      </section>

      <section className="quiz-card">
        <div className="quiz-header">
          <div>
            <p className="question-step">
              Question {questionIndex + 1} of {deck.length}
            </p>
          </div>
          <div className="header-actions">
            <button
              className="secondary-button icon-button"
              onClick={toggleSettings}
              aria-label={settingsLabel}
              title={settingsLabel}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.65 1.65 0 0 0 15 19.4a1.65 1.65 0 0 0-1 .6 1.65 1.65 0 0 0-.33 1V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-.33-1 1.65 1.65 0 0 0-1-.6 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-.6-1 1.65 1.65 0 0 0-1-.33H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1-.33 1.65 1.65 0 0 0 .6-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-.6 1.65 1.65 0 0 0 .33-1V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 .33 1 1.65 1.65 0 0 0 1 .6 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.24.3.44.64.6 1a1.65 1.65 0 0 0 1 .33H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1 .33 1.65 1.65 0 0 0-.51.34z" />
              </svg>
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
            <button
              className="secondary-button icon-button"
              onClick={resetRound}
              aria-label="Reshuffle round"
              title="Reshuffle round"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M21 12a9 9 0 1 1-2.64-6.36" />
                <path d="M21 4v6h-6" />
              </svg>
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
            <button className="secondary-button" onClick={applySettingsAndReshuffle}>
              Apply and reshuffle
            </button>
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
              <p className="question-phrase">{currentQuestion.promptTerm}</p>
              <span className="question-type">{currentQuestion.entryType}</span>
            </div>
          </header>

          <div className="options-grid">
            {currentQuestion.optionIds.map((optionId, optionIndex) => {
              const entry = vocabMap[optionId]

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
      </section>
    </main>
  )
}

export default App
