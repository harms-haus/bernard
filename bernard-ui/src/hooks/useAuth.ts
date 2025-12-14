import React, { createContext, useContext, useEffect, useReducer, ReactNode } from 'react';
import { apiClient } from '../services/api';
import { User, UserStatus } from '../types/auth';
import { AuthState, AuthAction, LoginCredentials, LoginResponse } from '../types/auth';

type AuthContextType = {
  state: AuthState;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
  getCurrentUser: () => Promise<void>;
  updateProfile: (data: { displayName?: string; email?: string }) => Promise<User>;
  clearError: () => void;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

type AuthProviderProps = {
  children: ReactNode;
};

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'LOGIN_START':
      return {
        ...state,
        loading: true,
        error: null
      };
    case 'LOGIN_SUCCESS':
      return {
        ...state,
        user: action.payload.user,
        loading: false,
        error: null
      };
    case 'LOGIN_FAILURE':
      return {
        ...state,
        user: null,
        loading: false,
        error: action.payload.error
      };
    case 'LOGOUT':
      return {
        ...state,
        user: null,
        loading: false,
        error: null
      };
    case 'SET_LOADING':
      return {
        ...state,
        loading: action.payload.loading
      };
    case 'CLEAR_ERROR':
      return {
        ...state,
        error: null
      };
    default:
      return state;
  }
}

const initialState: AuthState = {
  user: null,
  loading: false,
  error: null
};

export function AuthProvider({ children }: AuthProviderProps) {
  const [state, dispatch] = useReducer(authReducer, initialState);

  const login = async (credentials: LoginCredentials) => {
    try {
      dispatch({ type: 'LOGIN_START' });
      const response: LoginResponse = await apiClient.login(credentials);
      dispatch({ type: 'LOGIN_SUCCESS', payload: { user: response.user } });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Login failed';
      dispatch({ type: 'LOGIN_FAILURE', payload: { error: errorMessage } });
      throw error;
    }
  };

  const logout = async () => {
    try {
      await apiClient.logout();
      dispatch({ type: 'LOGOUT' });
    } catch (error) {
      // Even if logout fails, clear local state
      dispatch({ type: 'LOGOUT' });
    }
  };

  const getCurrentUser = async () => {
    try {
      dispatch({ type: 'SET_LOADING', payload: { loading: true } });
      const user = await apiClient.getCurrentUser();
      dispatch({ type: 'LOGIN_SUCCESS', payload: { user: user || null } });
    } catch (error) {
      dispatch({ type: 'LOGOUT' });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: { loading: false } });
    }
  };

  const updateProfile = async (data: { displayName?: string; email?: string }) => {
    try {
      const updatedUser = await apiClient.updateProfile(data);
      dispatch({ type: 'LOGIN_SUCCESS', payload: { user: updatedUser } });
      return updatedUser;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Update failed';
      dispatch({ type: 'LOGIN_FAILURE', payload: { error: errorMessage } });
      throw error;
    }
  };

  const clearError = () => {
    dispatch({ type: 'CLEAR_ERROR' });
  };

  // Initialize auth state on mount
  useEffect(() => {
    getCurrentUser();
  }, []);

  const value = {
    state,
    login,
    logout,
    getCurrentUser,
    updateProfile,
    clearError
  };

  return React.createElement(AuthContext.Provider, { value }, children);
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}