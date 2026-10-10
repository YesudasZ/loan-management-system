import { z } from 'zod';
import { API_PREFIX, SERVER_WAKE_RETRY_DELAYS_MS } from './constants';

/** An error response from the API, or SERVER_UNAVAILABLE when the API couldn't be reached. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const envelopeSchema = z.union([
  z.object({ success: z.literal(true), data: z.unknown() }),
  z.object({
    success: z.literal(false),
    error: z.object({ code: z.string(), message: z.string(), details: z.unknown().optional() }),
  }),
]);

const fieldErrorsSchema = z.array(z.object({ field: z.string(), message: z.string() }));

/** Turns VALIDATION_ERROR details into `{ fieldName: message }` for forms. */
export function getFieldErrors(error: ApiError): Record<string, string> {
  const parsed = fieldErrorsSchema.safeParse(error.details);
  if (!parsed.success) return {};
  return Object.fromEntries(parsed.data.map((issue) => [issue.field, issue.message]));
}

const ruleFailuresSchema = z.object({ failures: z.array(z.object({ message: z.string() })) });

/** Messages from a business-rule error (422 with `details.failures`), or [] otherwise. */
export function getFailureMessages(error: ApiError): string[] {
  const parsed = ruleFailuresSchema.safeParse(error.details);
  return parsed.success ? parsed.data.failures.map((failure) => failure.message) : [];
}

// --- "Waking up the server" banner state (Render's free tier sleeps when idle) ---

type WakingListener = (isWaking: boolean) => void;
const wakingListeners = new Set<WakingListener>();
let isServerWaking = false;

function setServerWaking(value: boolean): void {
  if (isServerWaking === value) return;
  isServerWaking = value;
  wakingListeners.forEach((listener) => listener(value));
}

export function subscribeToServerWaking(listener: WakingListener): () => void {
  wakingListeners.add(listener);
  return () => wakingListeners.delete(listener);
}

export function getServerWaking(): boolean {
  return isServerWaking;
}

// --- Requests ---

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

interface RequestOptions {
  method?: HttpMethod;
  /** JSON body. POST/PUT always send at least `{}`. */
  body?: unknown;
  /** Multipart body (file uploads); the browser sets the Content-Type. */
  formData?: FormData;
  signal?: AbortSignal;
}

function serverUnavailable(status: number): ApiError {
  return new ApiError(
    status,
    'SERVER_UNAVAILABLE',
    'The server is starting up. Please try again in a moment.',
  );
}

function buildInit(options: RequestOptions): RequestInit {
  const method = options.method ?? 'GET';
  const init: RequestInit = { method, credentials: 'same-origin', signal: options.signal };
  if (options.formData) {
    init.body = options.formData;
  } else if (method !== 'GET') {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(options.body ?? {});
  }
  return init;
}

async function sendOnce(path: string, init: RequestInit): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`${API_PREFIX}${path}`, init);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw serverUnavailable(0);
  }

  const isJson = response.headers.get('content-type')?.includes('application/json') ?? false;
  if (!isJson) {
    // While Render wakes up, the proxy may answer with an HTML page or a 502/504.
    throw serverUnavailable(response.status);
  }

  const envelope = envelopeSchema.safeParse(await response.json());
  if (!envelope.success) {
    throw serverUnavailable(response.status);
  }
  if (!envelope.data.success) {
    const { code, message, details } = envelope.data.error;
    throw new ApiError(response.status, code, message, details);
  }
  return envelope.data.data;
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    });
  });
}

/** GETs are safe to repeat, so they retry while the server wakes up. Mutations never retry. */
async function sendWithWakeRetries(path: string, init: RequestInit): Promise<unknown> {
  const isRetryable = init.method === 'GET';
  for (let attempt = 0; ; attempt += 1) {
    try {
      const data = await sendOnce(path, init);
      setServerWaking(false);
      return data;
    } catch (error) {
      const delay = SERVER_WAKE_RETRY_DELAYS_MS[attempt];
      const isWakeError = error instanceof ApiError && error.code === 'SERVER_UNAVAILABLE';
      if (!isWakeError || !isRetryable || delay === undefined) {
        setServerWaking(false);
        throw error;
      }
      setServerWaking(true);
      await wait(delay, init.signal ?? undefined);
    }
  }
}

/**
 * Runs outside React (no useRouter here), and a full page load is intended: once the session
 * is gone or a role check fails, no client state from the old page should survive.
 */
function redirectForAuthError(error: ApiError): void {
  if (typeof window === 'undefined') return;
  if (error.code === 'UNAUTHENTICATED') {
    const current = `${window.location.pathname}${window.location.search}`;
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- see above
    window.location.href = `/login?next=${encodeURIComponent(current)}`;
  } else if (error.code === 'FORBIDDEN') {
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- see above
    window.location.href = '/forbidden';
  }
}

/**
 * Calls the API through the same-origin `/api` proxy and returns `data` from the envelope.
 * Throws ApiError for every error response. Only UNAUTHENTICATED (→ /login) and FORBIDDEN
 * (→ /forbidden) redirect; every other error (e.g. INVALID_CREDENTIALS, 409, 422) is for
 * the caller to show.
 *
 * The response type is trusted: the API is ours and validates its own output shapes.
 */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  try {
    return (await sendWithWakeRetries(path, buildInit(options))) as T;
  } catch (error) {
    if (error instanceof ApiError) redirectForAuthError(error);
    throw error;
  }
}
