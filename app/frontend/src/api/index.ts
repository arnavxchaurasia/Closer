import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { storage } from '@/src/utils/storage';

const BASE_URL =
  process.env.EXPO_BACKEND_URL ??
  process.env.EXPO_PUBLIC_BACKEND_URL ??
  Constants.expoConfig?.extra?.backendUrl ??
  'http://localhost:8000';

class Api {
  private async getHeaders(): Promise<Record<string, string>> {
    const token = await storage.secureGet('session_token', null);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    params?: Record<string, string | number | boolean>,
  ): Promise<T> {
    const headers = await this.getHeaders();

    let url = `${BASE_URL}${path}`;
    if (params && Object.keys(params).length > 0) {
      const qs = new URLSearchParams(
        Object.fromEntries(
          Object.entries(params).map(([k, v]) => [k, String(v)]),
        ),
      ).toString();
      url = `${url}?${qs}`;
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (response.status === 401) {
      await storage.secureRemove('session_token');
      await storage.removeItem('cached_user_profile');
      throw new Error('Unauthorized');
    }

    if (!response.ok) {
      let message = `HTTP ${response.status}`;
      try {
        const errorBody = await response.json();
        message = errorBody?.detail ?? errorBody?.message ?? message;
      } catch {
        // ignore parse errors
      }
      throw new Error(message);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }

  get<T>(path: string, params?: Record<string, string | number | boolean>): Promise<T> {
    return this.request<T>('GET', path, undefined, params);
  }

  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('PUT', path, body);
  }

  patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('PATCH', path, body);
  }

  del<T>(path: string): Promise<T> {
    return this.request<T>('DELETE', path);
  }

  /**
   * Upload a local media file (from expo-image-picker / audio recording) and
   * return a server-hosted URL both partners can load. Works on web and native.
   */
  async upload(uri: string, opts?: { name?: string; mimeType?: string }): Promise<{ url: string; path: string }> {
    const token = await storage.secureGet('session_token', null);
    const guessedName = opts?.name ?? uri.split('/').pop()?.split('?')[0] ?? `upload-${Date.now()}`;
    const name = guessedName.includes('.') ? guessedName : `${guessedName}.jpg`;

    const form = new FormData();
    if (Platform.OS === 'web') {
      const res = await fetch(uri);
      const blob = await res.blob();
      form.append('file', blob, name);
    } else {
      // React Native FormData accepts a file descriptor object
      form.append('file', {
        uri,
        name,
        type: opts?.mimeType ?? 'image/jpeg',
      } as any);
    }

    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    // NOTE: never set Content-Type manually for multipart — the runtime adds the boundary.

    const response = await fetch(`${BASE_URL}/api/upload`, { method: 'POST', headers, body: form });
    if (!response.ok) {
      let message = `HTTP ${response.status}`;
      try { const b = await response.json(); message = b?.detail ?? message; } catch {}
      throw new Error(message);
    }
    return response.json() as Promise<{ url: string; path: string }>;
  }
}

export const api = new Api();
