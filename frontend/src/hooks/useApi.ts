"use client";

import { useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';

let refreshPromise: Promise<string | null> | null = null;
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const EXCLUDED_ENDPOINTS = [
  '/auth/nonce/',
  '/auth/verify/',
  '/auth/refresh/',
  '/auth/logout/'
];

export function useApi() {
  const { accessToken, setAccessToken, logout } = useAuth();

  const fetchApi = useCallback(async (endpoint: string, options: RequestInit = {}) => {
    // 1. Automatically append trailing slash if missing, handling query strings
    const [pathPart, queryPart] = endpoint.split('?', 2);
    let finalPath = pathPart;
    if (!finalPath.endsWith('/')) {
      finalPath += '/';
    }
    const urlPath = queryPart ? `${finalPath}?${queryPart}` : finalPath;
    const url = `${API_URL}${urlPath}`;

    const headers = new Headers(options.headers);
    // 2. Automatically attach access token
    if (accessToken) {
      headers.set('Authorization', `Bearer ${accessToken}`);
    }

    const fetchOptions: RequestInit = {
      ...options,
      headers,
      credentials: 'include', // Always include credentials
    };

    let response = await fetch(url, fetchOptions);

    // 3. Token refresh logic
    if (response.status === 401 && !EXCLUDED_ENDPOINTS.includes(urlPath)) {
      // 4. Guard against race conditions
      if (!refreshPromise) {
        refreshPromise = fetch(`${API_URL}/auth/refresh/`, {
          method: 'POST',
          credentials: 'include' // 4. Explicitly include credentials for the refresh call
        }).then(async res => {
          if (!res.ok) return null;
          const data = await res.json();
          return data.access;
        }).catch((err: unknown) => {
          // Silent catch to prevent unhandled rejection overlay on refresh failure
          return null;
        }).finally(() => {
          refreshPromise = null;
        });
      }

      const newAccess = await refreshPromise;
      if (newAccess) {
        setAccessToken(newAccess);
        headers.set('Authorization', `Bearer ${newAccess}`);
        response = await fetch(url, { ...fetchOptions, headers });
      } else {
        // 5. Refresh failure path: clear local context only, no backend /auth/logout/ call
        logout();
      }
    }

    return response;
  }, [accessToken, setAccessToken, logout]);

  return { fetchApi };
}
