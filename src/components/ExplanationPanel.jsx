import { motion } from 'framer-motion'

const MotionDiv = motion.div

export function ExplanationPanel({
  entry,
  onAudio,
  speaking,
  speechSupported,
}) {
  const audioLabel = speechSupported
    ? speaking
      ? 'Stop French audio'
      : 'Play French audio'
    : 'Speech not supported in this browser'

  return (
    <MotionDiv
      className="panel"
      initial={{ opacity: 0, height: 0, y: -8 }}
      animate={{ opacity: 1, height: 'auto', y: 0 }}
      exit={{ opacity: 0, height: 0, y: -8 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      <div className="panel-shell">
        <div className="panel-heading">
          <div>
            <h4>French breakdown</h4>
            <p className="term-list">{entry.terms.join(' / ')}</p>
          </div>
        </div>

        <p className="panel-copy">{entry.note}</p>

        <div className="panel-grid">
          <section className="example-block">
            <div className="example-header-row">
              <h5>Usage example</h5>
              <button
                className="ghost-button icon-button audio-icon-button"
                onClick={onAudio}
                disabled={!speechSupported}
                aria-label={audioLabel}
                title={audioLabel}
              >
                {speaking ? (
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
            <p className="sentence-french">{entry.exampleFrench}</p>
            <p className="sentence-english">{entry.exampleEnglish}</p>
          </section>

          <aside className="image-card image-card--placeholder">
            <p className="image-caption">Illustration coming soon.</p>
          </aside>
        </div>
      </div>
    </MotionDiv>
  )
}
