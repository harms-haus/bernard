export type UserStatus = 'active' | 'disabled' | 'deleted';

export interface User {
  id: string;
  displayName: string;
  isAdmin: boolean;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
}

export interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface LoginResponse {
  user: User;
  accessToken: string;
}

export type OAuthProvider = 'github' | 'google';

export interface GenerateAccessTokenResponse {
  token: string;
  expiresAt: string;
}

export interface UpdateProfileRequest {
  displayName?: string;
  email?: string;
}

export interface APIError {
  message: string;
  status?: number;
  details?: unknown;
}

export type AuthAction =
  | { type: 'LOGIN_START' }
  | { type: 'LOGIN_SUCCESS'; payload: { user: User } }
  | { type: 'LOGIN_FAILURE'; payload: { error: string } }
  | { type: 'LOGOUT' }
  | { type: 'SET_LOADING'; payload: { loading: boolean } }
  | { type: 'CLEAR_ERROR' };