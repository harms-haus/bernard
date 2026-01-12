export function createMockStream(data: string | Uint8Array) {
  const encoder = new TextEncoder()
  const bytes = typeof data === 'string' ? encoder.encode(data) : data

  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes)
      controller.close()
    },
  })
}

export function createMockChunkedStream(chunks: string[]) {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        const bytes = new TextEncoder().encode(chunk)
        controller.enqueue(bytes)
      }
      controller.close()
    },
  })
}
