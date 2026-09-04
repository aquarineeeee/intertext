export type ApiUser = {
  id: string
  email: string
  display_name: string | null
  is_active: boolean
  created_at: string
}

export type ApiBook = {
  id: string
  title: string
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

export type ApiProgress = {
  id: string
  book_id: string
  chapter_id: string | null
  updated_at: string
} | null

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
}

export type ApiAIProvider = {
  id: string
  name: string
  provider_type: 'openai' | 'anthropic' | 'ollama' | string
  model: string
  base_url: string | null
  enabled: boolean
  has_api_key: boolean
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
  getProgress: (bookId: string) => request<ApiProgress>(`/books/${bookId}/progress`),
  listAnnotations: (bookId: string) => request<ApiAnnotation[]>(`/books/${bookId}/annotations`),
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
  createConversation: (bookId: string, title = '新对话') =>
    request<ApiConversation>(`/books/${bookId}/conversations`, {
      method: 'POST',
      body: JSON.stringify({ title }),
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
  importBook: (file: File) => {
    const body = new FormData()
    body.append('file', file)
    return request<ApiBook>('/books/import', { method: 'POST', body })
  },
  listAIProviders: () => request<ApiAIProvider[]>('/ai/providers'),
  createAIProvider: (provider: { name: string; provider_type: 'openai' | 'anthropic' | 'ollama'; model: string; base_url?: string; api_key?: string; enabled?: boolean }) =>
    request<ApiAIProvider>('/ai/providers', { method: 'POST', body: JSON.stringify(provider) }),
  updateAIProvider: (providerId: string, changes: Partial<Pick<ApiAIProvider, 'name' | 'model' | 'base_url' | 'enabled'>> & { api_key?: string }) =>
    request<ApiAIProvider>(`/ai/providers/${providerId}`, { method: 'PATCH', body: JSON.stringify(changes) }),
  deleteAIProvider: (providerId: string) => request<void>(`/ai/providers/${providerId}`, { method: 'DELETE' }),
  searchBook: (bookId: string, query: string, chapterId?: string, limit = 6) =>
    request<ApiSearchResult[]>(`/books/${bookId}/search`, { method: 'POST', body: JSON.stringify({ book_id: bookId, query, chapter_id: chapterId, limit }) }),
  createAIRun: (bookId: string, conversationId: string, payload: { content: string; client_message_id?: string; provider_id?: string; model?: string; chapter_id?: string; selection?: string }) =>
    request<ApiAIRun>(`/books/${bookId}/conversations/${conversationId}/runs`, { method: 'POST', body: JSON.stringify(payload) }),
  getAIRun: (runId: string) => request<ApiAIRun>(`/ai/runs/${runId}`),
  cancelAIRun: (runId: string) => request<ApiAIRun>(`/ai/runs/${runId}/cancel`, { method: 'POST' }),
}

export function isUnauthorized(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'status' in error && (error as { status?: number }).status === 401
}
