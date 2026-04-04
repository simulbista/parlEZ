function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function shuffle(items) {
  const copy = [...items]

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]]
  }

  return copy
}

function samplePromptTerm(entry) {
  return entry.terms[Math.floor(Math.random() * entry.terms.length)]
}

function getWeight(entry, progressById) {
  const stats = progressById[entry.id]

  if (!stats) {
    return 1
  }

  const correct = Number(stats.correct || 0)
  const incorrect = Number(stats.incorrect || 0)
  let weight = 1 + incorrect * 0.8 - correct * 0.25

  if (stats.lastOutcome === 'correct') {
    weight *= 0.65
  }

  if (stats.lastOutcome === 'incorrect') {
    weight *= 1.45
  }

  if (stats.lastSeenAt) {
    const hoursSinceSeen = (Date.now() - stats.lastSeenAt) / (1000 * 60 * 60)

    if (stats.lastOutcome === 'correct' && hoursSinceSeen < 24) {
      weight *= 0.55
    }

    if (stats.lastOutcome === 'incorrect' && hoursSinceSeen < 24) {
      weight *= 1.2
    }
  }

  return clamp(weight, 0.15, 5)
}

function weightedDrawUnique(vocabBank, count, progressById) {
  const pool = [...vocabBank]
  const selected = []
  const target = Math.min(count, pool.length)

  while (selected.length < target && pool.length > 0) {
    const totalWeight = pool.reduce(
      (sum, entry) => sum + getWeight(entry, progressById),
      0,
    )

    let roll = Math.random() * totalWeight
    let pickedIndex = pool.length - 1

    for (let index = 0; index < pool.length; index += 1) {
      roll -= getWeight(pool[index], progressById)

      if (roll <= 0) {
        pickedIndex = index
        break
      }
    }

    selected.push(pool[pickedIndex])
    pool.splice(pickedIndex, 1)
  }

  return selected
}

export function buildQuizDeck(vocabBank, roundSize, progressById = {}) {
  const promptPool = weightedDrawUnique(vocabBank, roundSize, progressById)

  return promptPool.map((entry, index) => {
    const distractors = shuffle(
      vocabBank.filter(
        (candidate) =>
          candidate.id !== entry.id && candidate.english !== entry.english,
      ),
    ).slice(0, 3)

    return {
      id: `${entry.id}-${index}`,
      promptTerm: samplePromptTerm(entry),
      answerId: entry.id,
      entryType: 'Choose the correct answer',
      optionIds: shuffle([entry, ...distractors]).map((option) => option.id),
    }
  })
}
