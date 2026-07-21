"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface AuthContextType {
  accessToken: string | null;
  setAccessToken: (token: string | null) => void;
  isAuthenticated: boolean;
  isInitializing: boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState<boolean>(true);

  useEffect(() => {
    const initAuth = async () => {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/auth/refresh/`, {
          method: 'POST',
          credentials: 'include'
        });
        if (res.ok) {
          const data = await res.json();
          setAccessToken(data.access);
        }
      } catch (err) {
        console.error("Auth initialization failed:", err);
      } finally {
        setIsInitializing(false);
      }
    };
    initAuth();
  }, []);

  const logout = () => {
    setAccessToken(null);
  };

  return (
    <AuthContext.Provider value={{
      accessToken,
      setAccessToken,
      isAuthenticated: !!accessToken,
      isInitializing,
      logout
    }}>
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
