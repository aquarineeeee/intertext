export type ApiUser = {
  id: string
  email: string
  display_name: string | null
  is_active: boolean
  created_at: string
}

export type ApiUserSettings = { style: 'guided' | 'discussion' | 'concise'; prompt: string }

export type ApiBook = {
  id: string
  title: string
  author: string | null
  description: string | null
  status: 'uploaded' | 'parsing' | 'ready' | 'failed' | string
  parse_error: string | null
  created_at: string
  updated_at: string
  import_file: {
    id: string
    file_name: string
    file_format: string
    file_size: number
    file_hash: string
    created_at: string
  }
}

export type ApiChapter = {
  id: string
  chapter_index: number
  title: string
  text_length: number
}

export type ApiChapterContent = ApiChapter & {
  text: string
  chunks: Array<{ id: string; chunk_index: number; text: string; start_offset: number; end_offset: number }>
}

export type ApiProgress = {
  id: string
  book_id: string
  last_read_chapter_id: string | null
  furthest_read_chapter_id: string | null
  updated_at: string
} | null

export type ApiReadingStats = {
  day_streak: number
  active_days_this_month: number
  books_finished: number
  activity: Array<{ date: string; count: number }>
}

export type ApiAnnotation = {
  id: string
  book_id: string
  chapter_id: string
  start_offset: number
  end_offset: number
  selected_text: string
  note_content: string | null
  color: string
  status: 'active' | 'orphaned' | string
  location_error: string | null
  created_at: string
  updated_at: string
}

export type ApiExcerpt = {
  id: string
  book_id: string
  chapter_id: string
  start_offset: number
  end_offset: number
  selected_text: string
  created_at: string
  updated_at: string
}

export type ApiNote = {
  id: string
  book_id: string
  title: string
  content: string
  created_at: string
  updated_at: string
}

export type ApiConversation = {
  id: string
  book_id: string
  annotation_id: string | null
  title: string
  created_at: string
  updated_at: string
}

export type ApiMessage = {
  id: string
  conversation_id: string
  role: 'user' | 'assistant' | 'system' | string
  content: string
  client_message_id: string | null
  model: string | null
  status: 'pending' | 'streaming' | 'completed' | 'failed' | 'cancelled' | 'partial' | string
  created_at: string
  updated_at: string
  ai_run_id: string | null
}

export type ApiAIProvider = {
  id: string
  name: string
  provider_type: 'openai' | 'anthropic' | 'ollama' | 'custom' | string
  interface_format: 'openai' | 'anthropic' | 'ollama' | null
  model: string
  base_url: string | null
  enabled: boolean
  has_api_key: boolean
  created_at: string
  updated_at: string
}

export type ApiMCPTool = {
  name?: string
  description?: string
  inputSchema?: Record<string, unknown>
  enabled?: boolean
}

export type ApiMCPServer = {
  id: string
  name: string
  endpoint: string
  transport: 'streamable-http' | 'sse'
  has_token: boolean
  capabilities: { tools?: ApiMCPTool[] } | null
  enabled: boolean
  created_at: string
  updated_at: string
}

export type ApiAIRun = {
  id: string
  conversation_id: string
  user_message_id: string
  assistant_message_id: string
  provider_id: string | null
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'partial' | string
  last_sequence: number
  error_message: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

export type ApiAIRunEvent = {
  sequence: number
  event_type: string
  payload: Record<string, unknown>
  created_at: string
}

export type ApiAIRunTranscriptEntry = {
  sequence: number
  entry_type: 'assistant' | 'tool_call' | 'tool_result' | string
  payload: Record<string, unknown>
  created_at: string
}

export type ApiSearchResult = {
  chunk_id: string
  book_id: string
  chapter_id: string
  chapter_index: number
  chapter_title: string
  text: string
  start_offset: number
  end_offset: number
  score: number | null
}

export type ApiError = {
  error?: {
    code?: string
    message?: string
  }
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/$/, '')

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...options.headers,
    },
  })

  if (!response.ok) {
    let payload: ApiError = {}
    try {
      payload = (await response.json()) as ApiError
    } catch {
      // Keep a useful error when the backend/proxy returns a non-JSON response.
    }
    const error = new Error(payload.error?.message || `请求失败（${response.status}）`) as Error & {
      status?: number
      code?: string
    }
    error.status = response.status
    error.code = payload.error?.code
    throw error
  }

  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

export const api = {
  me: () => request<ApiUser>('/auth/me'),
  getUserSettings: () => request<ApiUserSettings>('/auth/settings'),
  updateUserSettings: (changes: Partial<ApiUserSettings>) => request<ApiUserSettings>('/auth/settings', { method: 'PATCH', body: JSON.stringify(changes) }),
  login: (email: string, password: string) =>
    request<{ user: ApiUser }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  register: (email: string, password: string, displayName: string) =>
    request<{ user: ApiUser }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, display_name: displayName || undefined }),
    }),
  logout: () => request<void>('/auth/logout', { method: 'POST' }),
  listBooks: () => request<ApiBook[]>('/books'),
  listChapters: (bookId: string) => request<ApiChapter[]>(`/books/${bookId}/chapters`),
  getChapter: (bookId: string, chapterId: string) => request<ApiChapterContent>(`/books/${bookId}/chapters/${chapterId}`),
  getProgress: (bookId: string) => request<ApiProgress>(`/books/${bookId}/progress`),
  getReadingStats: () => request<ApiReadingStats>('/reading/stats'),
  saveProgress: (bookId: string, lastReadChapterId: string) => request<NonNullable<ApiProgress>>(`/books/${bookId}/progress`, { method: 'PUT', body: JSON.stringify({ last_read_chapter_id: lastReadChapterId }) }),
  listAnnotations: (bookId: string) => request<ApiAnnotation[]>(`/books/${bookId}/annotations`),
  createAnnotation: (bookId: string, annotation: { chapter_id: string; start_offset: number; end_offset: number; selected_text: string; note_content?: string; color?: string }) =>
    request<ApiAnnotation>(`/books/${bookId}/annotations`, { method: 'POST', body: JSON.stringify(annotation) }),
  updateAnnotation: (bookId: string, annotationId: string, changes: { note_content?: string | null; color?: string }) =>
    request<ApiAnnotation>(`/books/${bookId}/annotations/${annotationId}`, { method: 'PATCH', body: JSON.stringify(changes) }),
  deleteAnnotation: (bookId: string, annotationId: string) => request<void>(`/books/${bookId}/annotations/${annotationId}`, { method: 'DELETE' }),
  listExcerpts: (bookId: string) => request<ApiExcerpt[]>(`/books/${bookId}/excerpts`),
  createExcerpt: (bookId: string, excerpt: { chapter_id: string; start_offset: number; end_offset: number; selected_text: string }) =>
    request<ApiExcerpt>(`/books/${bookId}/excerpts`, { method: 'POST', body: JSON.stringify(excerpt) }),
  deleteExcerpt: (bookId: string, excerptId: string) => request<void>(`/books/${bookId}/excerpts/${excerptId}`, { method: 'DELETE' }),
  listNotes: (bookId: string) => request<ApiNote[]>(`/books/${bookId}/notes`),
  createNote: (bookId: string, title: string, content: string) =>
    request<ApiNote>(`/books/${bookId}/notes`, {
      method: 'POST',
      body: JSON.stringify({ title, content }),
    }),
  updateNote: (bookId: string, noteId: string, changes: { title?: string; content?: string }) =>
    request<ApiNote>(`/books/${bookId}/notes/${noteId}`, {
      method: 'PATCH',
      body: JSON.stringify(changes),
    }),
  deleteNote: (bookId: string, noteId: string) => request<void>(`/books/${bookId}/notes/${noteId}`, { method: 'DELETE' }),
  listConversations: (bookId: string) => request<ApiConversation[]>(`/books/${bookId}/conversations`),
  createConversation: (bookId: string, title = '新对话', annotationId?: string) =>
    request<ApiConversation>(`/books/${bookId}/conversations`, {
      method: 'POST',
      body: JSON.stringify({ title, annotation_id: annotationId }),
    }),
  updateConversation: (bookId: string, conversationId: string, title: string) =>
    request<ApiConversation>(`/books/${bookId}/conversations/${conversationId}`, {
      method: 'PATCH',
      body: JSON.stringify({ title }),
    }),
  deleteConversation: (bookId: string, conversationId: string) =>
    request<void>(`/books/${bookId}/conversations/${conversationId}`, { method: 'DELETE' }),
  listMessages: (bookId: string, conversationId: string) =>
    request<ApiMessage[]>(`/books/${bookId}/conversations/${conversationId}/messages`),
  createMessage: (
    bookId: string,
    conversationId: string,
    message: { content: string; role?: 'user' | 'assistant' | 'system'; client_message_id?: string; model?: string; status?: ApiMessage['status'] },
  ) =>
    request<ApiMessage>(`/books/${bookId}/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: JSON.stringify(message),
    }),
  deleteBook: (bookId: string | number) => request<void>(`/books/${bookId}`, { method: 'DELETE' }),
  importBook: (file: File) => {
    const body = new FormData()
    body.append('file', file)
    return request<ApiBook>('/books/import', { method: 'POST', body })
  },
  listAIProviders: () => request<ApiAIProvider[]>('/ai/providers'),
  createAIProvider: (provider: { name: string; provider_type: 'openai' | 'anthropic' | 'ollama' | 'custom'; interface_format?: 'openai' | 'anthropic' | 'ollama'; model: string; base_url?: string; api_key?: string; enabled?: boolean }) =>
    request<ApiAIProvider>('/ai/providers', { method: 'POST', body: JSON.stringify(provider) }),
  updateAIProvider: (providerId: string, changes: Partial<Pick<ApiAIProvider, 'name' | 'model' | 'base_url' | 'enabled' | 'interface_format'>> & { api_key?: string }) =>
    request<ApiAIProvider>(`/ai/providers/${providerId}`, { method: 'PATCH', body: JSON.stringify(changes) }),
  deleteAIProvider: (providerId: string) => request<void>(`/ai/providers/${providerId}`, { method: 'DELETE' }),
  listMCPServers: () => request<ApiMCPServer[]>('/mcp/servers'),
  createMCPServer: (server: { name: string; endpoint: string; transport: 'streamable-http' | 'sse'; token?: string; enabled?: boolean }) =>
    request<ApiMCPServer>('/mcp/servers', { method: 'POST', body: JSON.stringify(server) }),
  updateMCPServer: (serverId: string, changes: Partial<Pick<ApiMCPServer, 'name' | 'endpoint' | 'transport' | 'enabled'>> & { token?: string }) =>
    request<ApiMCPServer>(`/mcp/servers/${serverId}`, { method: 'PATCH', body: JSON.stringify(changes) }),
  deleteMCPServer: (serverId: string) => request<void>(`/mcp/servers/${serverId}`, { method: 'DELETE' }),
  discoverMCPTools: (serverId: string) => request<ApiMCPTool[]>(`/mcp/servers/${serverId}/tools`, { method: 'POST' }),
  updateMCPTool: (serverId: string, toolName: string, enabled: boolean) => request<{ server_id: string; tool_name: string; enabled: boolean }>(`/mcp/servers/${serverId}/tools/${encodeURIComponent(toolName)}`, { method: 'PATCH', body: JSON.stringify({ enabled }) }),
  searchBook: (bookId: string, query: string, chapterId?: string, limit = 6) =>
    request<ApiSearchResult[]>(`/books/${bookId}/search`, { method: 'POST', body: JSON.stringify({ book_id: bookId, query, chapter_id: chapterId, limit }) }),
  createAIRun: (bookId: string, conversationId: string, payload: { content: string; client_message_id?: string; provider_id?: string; model?: string; chapter_id?: string; selection?: string }) =>
    request<ApiAIRun>(`/books/${bookId}/conversations/${conversationId}/runs`, { method: 'POST', body: JSON.stringify(payload) }),
  getAIRun: (runId: string) => request<ApiAIRun>(`/ai/runs/${runId}`),
  getAIRunTranscript: (runId: string) => request<ApiAIRunTranscriptEntry[]>(`/ai/runs/${runId}/transcript`),
  subscribeAIRunEvents: (runId: string, handlers: { onEvent?: (event: ApiAIRunEvent) => void; onError?: () => void }, after = 0) => {
    const source = new EventSource(`${API_BASE_URL}/ai/runs/${encodeURIComponent(runId)}/events?after=${after}`, { withCredentials: true })
    const eventTypes = ['run_started', 'text_delta', 'thinking_delta', 'tool_call_started', 'tool_call_completed', 'tool_disabled', 'tool_deadline_exceeded', 'tool_limit_reached', 'run_completed', 'failed', 'partial', 'cancelled']
    eventTypes.forEach(eventType => source.addEventListener(eventType, event => {
      try {
        const message = event as MessageEvent<string>
        handlers.onEvent?.({ sequence: Number(message.lastEventId || 0), event_type: eventType, payload: JSON.parse(message.data || '{}'), created_at: new Date().toISOString() })
      } catch {
        // Ignore malformed event payloads; the polling status remains authoritative.
      }
    }))
    source.onerror = () => handlers.onError?.()
    return source
  },
  cancelAIRun: (runId: string) => request<ApiAIRun>(`/ai/runs/${runId}/cancel`, { method: 'POST' }),
}

export function isUnauthorized(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'status' in error && (error as { status?: number }).status === 401
}
