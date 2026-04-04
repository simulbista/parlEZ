import { AnimatePresence, motion } from 'framer-motion'

const LETTERS = ['A', 'B', 'C', 'D']
const MotionArticle = motion.article
const MotionButton = motion.button

export function OptionCard({
  answered,
  children,
  entry,
  expanded,
  index,
  isCorrect,
  isSelected,
  onAction,
}) {
  const classes = ['option-card']

  if (isCorrect) {
    classes.push('is-correct')
  }

  if (answered && isSelected && !isCorrect) {
    classes.push('is-incorrect')
  }

  if (expanded) {
    classes.push('is-expanded')
  }

  let statusLabel = 'Choose answer'

  if (isCorrect) {
    statusLabel = 'Correct answer'
  } else if (answered && isSelected) {
    statusLabel = 'Your answer'
  } else if (answered) {
    statusLabel = expanded ? 'Hide notes' : 'Open notes'
  }

  return (
    <MotionArticle layout className={classes.join(' ')}>
      <MotionButton
        layout
        className="option-button"
        onClick={onAction}
        whileHover={{ y: -1 }}
        whileTap={{ scale: 0.995 }}
      >
        <span className="option-index">{LETTERS[index]}</span>

        <div className="option-copy">
          <h3>{entry.english}</h3>
          {answered ? (
            <p className="option-supporting">
              Tap to reveal the French wording, context, and example sentence.
            </p>
          ) : null}
        </div>

        <span className="option-status">{statusLabel}</span>
      </MotionButton>

      <AnimatePresence initial={false}>{expanded ? children : null}</AnimatePresence>
    </MotionArticle>
  )
}