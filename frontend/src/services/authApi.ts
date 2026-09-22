/** Account endpoints use the configured API origin, including browser cookies. */
import axios from 'axios';
import type { Role } from '../config/seedUsers';
import { getAccessToken, getMockUserHeader } from './auth';
import { API_BASE_URL } from './httpClient';

export interface AuthSession {
  accessToken: string;
  user: {
    id: string;
    email: string;
    name?: string | null;
    role: Role;
    emailVerified: boolean;
  };
}

async function request<T>(path: string, body: unknown, headers?: Record<string, string>): Promise<T> {
  try {
    const { data } = await axios.post<{ success: true; data: T }>(path, body, {
      baseURL: API_BASE_URL,
      timeout: 10_000,
      withCredentials: true,
      headers,
    });
    return data.data;
  } catch (error) {
    if (axios.isAxiosError<{ error?: { message?: string } }>(error)) {
      throw new Error(error.response?.data.error?.message ??
        (error.response ? 'The request could not be completed. Please try again.' :
          'Unable to reach the server. Please check your connection.'));
    }
    throw error;
  }
}

export const authApi = {
  login(email: string, password: string): Promise<AuthSession> {
    return request('/auth/login', { email: email.trim(), password });
  },
  async register(input: { email: string; password: string; role: 'BRAND' | 'CREATOR' }): Promise<void> {
    await request('/auth/register', { ...input, email: input.email.trim() });
  },
  async verifyEmail(token: string): Promise<void> {
    await request('/auth/verify-email', { token });
  },
  async logout(): Promise<void> {
    // Capture credentials before AuthProvider clears browser storage. The
    // server clears its HttpOnly cookie; local sign-out never waits on a network.
    const token = getAccessToken();
    const persona = getMockUserHeader();
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    else if (persona) headers['X-Mock-User'] = persona;
    if (token || persona) await request('/auth/logout', {}, headers);
  },
};
