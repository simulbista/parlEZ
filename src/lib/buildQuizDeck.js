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

function shouldUseCloze(entry) {
  return (
    entry.category === 'connectors' ||
    entry.category === 'pronoms relatifs' ||
    entry.quizMode === 'cloze'
  )
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function toFlexiblePattern(term) {
  return escapeRegex(term)
    .replace(/[’']/g, "[’']")
    .replace(/\\ /g, '\\s+')
}

function getFrenchElisionVariant(term) {
  if (!/que$/i.test(term)) {
    return term
  }

  return term.replace(/que$/i, "qu'")
}

function matchTermInExample(example, term) {
  // If example already has blanks, treat that as the match point
  const blankMatch = example.match(/_+/)
  if (blankMatch) {
    return {
      matchedText: blankMatch[0],
      answerTerm: term,
    }
  }

  const attempts = [term, getFrenchElisionVariant(term)]

  for (const attempt of attempts) {
    const pattern = new RegExp(toFlexiblePattern(attempt), 'i')
    const match = example.match(pattern)

    if (match) {
      return {
        matchedText: match[0],
        answerTerm: term,
      }
    }
  }

  return null
}

function getClozeAnswer(entry) {
  const example = entry.exampleFrench || ''
  const preferred = entry.blankTerm ? [entry.blankTerm] : []
  const candidates = [...preferred, ...shuffle([...(entry.terms || [])])]

  for (const term of candidates) {
    const match = matchTermInExample(example, term)

    if (match) {
      return {
        answerTerm: match.answerTerm,
        matchedText: match.matchedText,
      }
    }
  }

  const fallback = entry.blankTerm || samplePromptTerm(entry)

  return {
    answerTerm: fallback,
    matchedText: null,
  }
}

function buildClozePrompt(example, matchedText) {
  if (!example) {
    return '_____'
  }

  if (matchedText) {
    return example.replace(matchedText, '_____')
  }

  return `${example} (_____ )`
}

function uniqueTerms(terms) {
  return [...new Set((terms || []).map((term) => String(term).trim()).filter(Boolean))]
}

function getClozeDistractors(entry, vocabBank, answerTerm) {
  let pool = []

  if (entry.category === 'pronoms relatifs') {
    pool = uniqueTerms(entry.terms)
  } else if (
    entry.category === 'connectors' ||
    entry.category === 'subjonctif & indicatif' ||
    entry.category === 'émotions et sentiments'
  ) {
    pool = uniqueTerms(
      vocabBank
        .filter((candidate) => candidate.id !== entry.id && candidate.category === entry.category)
        .flatMap((candidate) => candidate.terms),
    )
  } else {
    pool = uniqueTerms(
      vocabBank
        .filter((candidate) => candidate.id !== entry.id && candidate.quizMode === 'cloze')
        .flatMap((candidate) => candidate.terms),
    )
  }

  let distractors = pool.filter((term) => term !== answerTerm)

  if (distractors.length < 3) {
    const localFallbacks = uniqueTerms(entry.terms).filter((term) => term !== answerTerm)
    distractors = uniqueTerms([...distractors, ...localFallbacks])
  }

  if (distractors.length < 3) {
    const globalFallbacks = uniqueTerms(vocabBank.flatMap((candidate) => candidate.terms)).filter(
      (term) => term !== answerTerm,
    )
    distractors = uniqueTerms([...distractors, ...globalFallbacks])
  }

  return shuffle(distractors).slice(0, 3)
}

function findSourceEntryByTerm(vocabBank, term, fallbackEntry) {
  return vocabBank.find((entry) => (entry.terms || []).includes(term)) || fallbackEntry
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
    if (shouldUseCloze(entry)) {
      const { answerTerm, matchedText } = getClozeAnswer(entry)
      const blankedExample = buildClozePrompt(entry.exampleFrench, matchedText)
      const distractors = getClozeDistractors(entry, vocabBank, answerTerm)
      const optionTerms = shuffle([answerTerm, ...distractors])
      const options = optionTerms.map((term) => {
        const sourceEntry = findSourceEntryByTerm(vocabBank, term, entry)

        return {
          id: `${sourceEntry.id}-${term}-${index}`,
          english: term,
          terms: [term],
          note: sourceEntry.note,
          exampleFrench: sourceEntry.exampleFrench,
          exampleEnglish: sourceEntry.exampleEnglish,
          blankTerm: sourceEntry.blankTerm || term,
        }
      })

      return {
        id: `${entry.id}-${index}`,
        promptTerm: blankedExample,
        answerId: answerTerm,
        entryType: 'Fill in the blank',
        optionIds: optionTerms,
        options,
        blankType: entry.english,
      }
    } else {
      // Vocab as before
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
    }
  })
}
