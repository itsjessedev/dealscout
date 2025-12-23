/**
 * Authentication context for managing user login state.
 * Uses eBay OAuth for authentication.
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../services/api';

interface User {
  id: number;
  username: string;
  display_name: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: () => Promise<string>; // Returns auth URL
  logout: () => Promise<void>;
  handleAuthCallback: (token: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const AUTH_TOKEN_KEY = '@dealscout/auth_token';
const USER_KEY = '@dealscout/user';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load stored auth on mount
  useEffect(() => {
    loadStoredAuth();
  }, []);

  const loadStoredAuth = async () => {
    try {
      const [storedToken, storedUser] = await Promise.all([
        AsyncStorage.getItem(AUTH_TOKEN_KEY),
        AsyncStorage.getItem(USER_KEY),
      ]);

      if (storedToken && storedUser) {
        api.setAuthToken(storedToken);
        setUser(JSON.parse(storedUser));

        // Verify token is still valid
        try {
          const status = await api.getAuthStatus();
          if (!status.authenticated) {
            // Token expired, clear auth
            await clearAuth();
          }
        } catch {
          // API error, clear auth
          await clearAuth();
        }
      }
    } catch (error) {
      console.error('Failed to load auth:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const clearAuth = async () => {
    await AsyncStorage.multiRemove([AUTH_TOKEN_KEY, USER_KEY]);
    api.setAuthToken(null);
    setUser(null);
  };

  const login = async (): Promise<string> => {
    const { auth_url } = await api.getLoginUrl('mobile');
    return auth_url;
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch {
      // Ignore errors, just clear local auth
    }
    await clearAuth();
  };

  const handleAuthCallback = async (token: string) => {
    // Store token
    api.setAuthToken(token);
    await AsyncStorage.setItem(AUTH_TOKEN_KEY, token);

    // Fetch user info
    try {
      const { user: userData } = await api.getCurrentUser();
      setUser(userData);
      await AsyncStorage.setItem(USER_KEY, JSON.stringify(userData));
    } catch (error) {
      console.error('Failed to fetch user:', error);
      await clearAuth();
      throw error;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
        handleAuthCallback,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
