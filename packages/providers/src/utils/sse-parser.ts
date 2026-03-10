/**
 * ClawAI Gateway - SSE Stream Parser
 * Parses Server-Sent Events streams
 */

/**
 * Parse an SSE stream and yield data events
 */
export async function* parseSSEStream(
  stream: ReadableStream<Uint8Array>
): AsyncGenerator<string, void, unknown> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        // Process any remaining buffer
        if (buffer.trim()) {
          const data = extractData(buffer);
          if (data) yield data;
        }
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      // Process complete events
      const events = buffer.split('\n\n');
      buffer = events.pop() || '';

      for (const event of events) {
        const data = extractData(event);
        if (data) yield data;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Extract data from an SSE event
 */
function extractData(event: string): string | null {
  const lines = event.split('\n');

  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const data = line.slice(6).trim();
      return data;
    }
  }

  return null;
}

/**
 * Create an SSE formatted string
 */
export function formatSSE(data: unknown, event?: string): string {
  let result = '';

  if (event) {
    result += `event: ${event}\n`;
  }

  result += `data: ${JSON.stringify(data)}\n\n`;

  return result;
}

/**
 * SSE done message
 */
export const SSE_DONE = 'data: [DONE]\n\n';
