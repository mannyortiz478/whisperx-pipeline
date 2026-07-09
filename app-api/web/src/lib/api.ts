const BASE_URL = (import.meta.env.VITE_APP_API_BASE_URL as string) ?? '';

/**
 * Centralized fetch wrapper.
 * Prepends BASE_URL to all requests so the app is portable.
 * Throws on non-2xx responses with the error body parsed.
 */
export async function apiFetch<T = unknown>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const resp = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
  });

  if (!resp.ok) {
    let errorMessage = `HTTP ${resp.status}`;
    try {
      const body = await resp.json();
      errorMessage = body.error ?? body.message ?? errorMessage;
    } catch {
      // ignore parse errors
    }
    throw new Error(errorMessage);
  }

  // Return null for 204 No Content
  if (resp.status === 204) return null as T;
  return resp.json() as Promise<T>;
}

/**
 * Upload variant that supports FormData and progress tracking.
 * Uses XMLHttpRequest so onProgress works (fetch doesn't support it).
 */
export function apiUpload(
  path: string,
  formData: FormData,
  onProgress?: (pct: number) => void,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${BASE_URL}${path}`);

    if (onProgress) {
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      });
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          resolve(xhr.responseText);
        }
      } else {
        try {
          const body = JSON.parse(xhr.responseText);
          reject(new Error(body.error ?? body.message ?? `HTTP ${xhr.status}`));
        } catch {
          reject(new Error(`HTTP ${xhr.status}`));
        }
      }
    };

    xhr.onerror = () => reject(new Error('Network error'));
    xhr.send(formData);
  });
}

/**
 * Build a full asset URL (for audio streaming, file downloads).
 * These are direct URLs not JSON API calls.
 */
export function assetUrl(path: string): string {
  return `${BASE_URL}${path}`;
}
