import type { AiProviderConfig } from './config.js'

export interface AiMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface AiResponse {
  content: string
  usage?: { inputTokens: number; outputTokens: number }
}

export async function sendToAi(
  config: AiProviderConfig,
  systemPrompt: string,
  messages: AiMessage[],
): Promise<AiResponse> {
  switch (config.provider) {
    case 'anthropic':
      return sendToAnthropic(config, systemPrompt, messages)
    case 'openai':
      return sendToOpenAi(config, systemPrompt, messages)
    case 'custom':
      return sendToCustom(config, systemPrompt, messages)
    default:
      throw new Error(`Unknown AI provider: ${config.provider}`)
  }
}

async function sendToAnthropic(
  config: AiProviderConfig,
  systemPrompt: string,
  messages: AiMessage[],
): Promise<AiResponse> {
  const model = config.model ?? 'claude-sonnet-4-5-20250929'

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 8192,
      system: systemPrompt,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Anthropic API error (${response.status}): ${error}`)
  }

  const data = await response.json() as {
    content: Array<{ type: string; text?: string }>
    usage?: { input_tokens: number; output_tokens: number }
  }

  const content = data.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('')

  return {
    content,
    usage: data.usage
      ? { inputTokens: data.usage.input_tokens, outputTokens: data.usage.output_tokens }
      : undefined,
  }
}

async function sendToOpenAi(
  config: AiProviderConfig,
  systemPrompt: string,
  messages: AiMessage[],
): Promise<AiResponse> {
  const model = config.model ?? 'gpt-4o'

  const openaiMessages = [
    { role: 'system' as const, content: systemPrompt },
    ...messages.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
  ]

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: 8192,
      messages: openaiMessages,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`OpenAI API error (${response.status}): ${error}`)
  }

  const data = await response.json() as {
    choices: Array<{ message: { content: string } }>
    usage?: { prompt_tokens: number; completion_tokens: number }
  }

  const content = data.choices[0]?.message?.content ?? ''

  return {
    content,
    usage: data.usage
      ? { inputTokens: data.usage.prompt_tokens, outputTokens: data.usage.completion_tokens }
      : undefined,
  }
}

async function sendToCustom(
  config: AiProviderConfig,
  systemPrompt: string,
  messages: AiMessage[],
): Promise<AiResponse> {
  if (!config.baseUrl) {
    throw new Error('Custom provider requires a base URL')
  }

  // Use OpenAI-compatible format for custom endpoints
  const model = config.model ?? 'default'

  const openaiMessages = [
    { role: 'system' as const, content: systemPrompt },
    ...messages.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
  ]

  const url = config.baseUrl.endsWith('/chat/completions')
    ? config.baseUrl
    : `${config.baseUrl.replace(/\/$/, '')}/chat/completions`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: 8192,
      messages: openaiMessages,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Custom AI API error (${response.status}): ${error}`)
  }

  const data = await response.json() as {
    choices: Array<{ message: { content: string } }>
    usage?: { prompt_tokens: number; completion_tokens: number }
  }

  const content = data.choices[0]?.message?.content ?? ''

  return {
    content,
    usage: data.usage
      ? { inputTokens: data.usage.prompt_tokens, outputTokens: data.usage.completion_tokens }
      : undefined,
  }
}
