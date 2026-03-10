/**
 * ClawAI Gateway - Token Counter
 * Simple token estimation without external dependencies
 */

/**
 * Estimate token count for a given text.
 * Uses a simple heuristic based on GPT tokenization patterns.
 * For production, consider using tiktoken or provider-specific tokenizers.
 */
export function estimateTokenCount(text: string): number {
  if (!text) return 0;

  // Simple estimation: ~4 characters per token for English text
  // This is a rough approximation and varies by language and content type
  const charCount = text.length;

  // Count word boundaries for better estimation
  const wordCount = text.split(/\s+/).filter(Boolean).length;

  // Average of character-based and word-based estimation
  const charBasedEstimate = Math.ceil(charCount / 4);
  const wordBasedEstimate = Math.ceil(wordCount * 1.3);

  // Use the average of both methods
  return Math.ceil((charBasedEstimate + wordBasedEstimate) / 2);
}

/**
 * Estimate tokens for a chat message array
 */
export function estimateMessagesTokenCount(
  messages: Array<{ role: string; content: string | unknown }>
): number {
  let total = 0;

  for (const message of messages) {
    // Role tokens
    total += 4; // Approximate overhead for role

    // Content tokens
    const content = typeof message.content === 'string'
      ? message.content
      : JSON.stringify(message.content);

    total += estimateTokenCount(content);
  }

  // Add overhead for message formatting
  total += 3; // Every reply is primed with <|start|>assistant<|message|>

  return total;
}

/**
 * Truncate text to fit within a token limit
 */
export function truncateToTokenLimit(text: string, maxTokens: number): string {
  const currentTokens = estimateTokenCount(text);

  if (currentTokens <= maxTokens) {
    return text;
  }

  // Estimate characters to keep
  const ratio = maxTokens / currentTokens;
  const targetLength = Math.floor(text.length * ratio * 0.95); // 5% buffer

  return text.slice(0, targetLength) + '...';
}

/**
 * Split text into chunks that fit within a token limit
 */
export function splitIntoChunks(text: string, maxTokensPerChunk: number): string[] {
  const chunks: string[] = [];
  const words = text.split(/\s+/);
  let currentChunk = '';

  for (const word of words) {
    const testChunk = currentChunk ? `${currentChunk} ${word}` : word;

    if (estimateTokenCount(testChunk) > maxTokensPerChunk) {
      if (currentChunk) {
        chunks.push(currentChunk);
        currentChunk = word;
      } else {
        // Single word exceeds limit, truncate it
        chunks.push(truncateToTokenLimit(word, maxTokensPerChunk));
        currentChunk = '';
      }
    } else {
      currentChunk = testChunk;
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks;
}
