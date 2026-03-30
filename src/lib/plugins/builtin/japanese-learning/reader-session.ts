let readerRetryScopeSequence = 0
let currentReaderRetryScope: string | null = null

export function advanceJapaneseLearningReaderRetryScope(): string {
  currentReaderRetryScope = `japanese-learning-reader:${++readerRetryScopeSequence}`
  return currentReaderRetryScope
}

export function getJapaneseLearningReaderRetryScope(): string | null {
  return currentReaderRetryScope
}

export function clearJapaneseLearningReaderRetryScope() {
  currentReaderRetryScope = null
}
