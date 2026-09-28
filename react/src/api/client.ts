import axios, { AxiosError } from 'axios';
import type { ApiErrorBody } from './types';
import { clearSession, getToken, notifySessionExpired } from './session';

const DEFAULT_API_URL = 'http://localhost:4000/api/v1';

/**
 * HTTP client.
 *
 * Everything the app sends goes through this instance, so two cross-cutting concerns live in exactly
 * one place: attaching the bearer token, and translating every failure into an `ApiError` the UI can
 * render. Feature modules then only deal with data, never with Axios.
 */
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? DEFAULT_API_URL,
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
});

/** Error shape the UI consumes: a message safe to display, plus the API error code when there is one. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

/** @param {unknown} value */
function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return typeof value === 'object' && value !== null;
}

/**
 * Convert anything Axios can reject with into one predictable error type.
 * @param error the rejected value
 */
export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;

  if (error instanceof AxiosError) {
    const body = isApiErrorBody(error.response?.data) ? error.response.data : undefined;
    const status = error.response?.status ?? 0;
    const message =
      body?.error?.message ??
      (status === 0
        ? 'Cannot reach the API. Is it running and is VITE_API_URL correct?'
        : error.message);
    return new ApiError(message, status, body?.error?.code ?? 'NETWORK_ERROR');
  }

  return new ApiError(error instanceof Error ? error.message : 'Unexpected error.', 0, 'UNKNOWN');
}

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    // A 401 on a request that carried a token means the session is gone (expired or revoked):
    // drop it once, centrally. A 401 from /login is a wrong password and is left to the login form.
    if (error.response?.status === 401 && getToken()) {
      clearSession();
      notifySessionExpired();
    }
    return Promise.reject(toApiError(error));
  },
);

/**
 * Typed convenience wrapper: `get<T>(path, params)` returns the response body.
 */
export async function get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
  const response = await api.get<T>(path, { params });
  return response.data;
}

export async function post<T>(path: string, body?: unknown): Promise<T> {
  const response = await api.post<T>(path, body);
  return response.data;
}
