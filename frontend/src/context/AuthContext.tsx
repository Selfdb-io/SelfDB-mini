import React, { createContext, useContext, useState, useEffect } from 'react';
import { API_KEY } from '../lib/api';
import { loginForAccessTokenUsersTokenPost, readUsersMeUsersMeGet } from '../client/sdk.gen';
import type { UserRead, LoginRequest } from '../client/types.gen';

interface AuthContextType {
    user: UserRead | null;
    token: string | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    login: (data: LoginRequest) => Promise<void>;
    logout: () => void;
    refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<UserRead | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const initAuth = async () => {
            const storedToken = localStorage.getItem('token');
            if (storedToken) {
                setToken(storedToken);
                try {
                    const { data } = await readUsersMeUsersMeGet({
                        headers: { 'X-API-Key': API_KEY }
                    });
                    if (data) {
                        setUser(data);
                    } else {
                        // Token might be invalid
                        localStorage.removeItem('token');
                        setToken(null);
                    }
                } catch (error) {
                    console.error('Failed to fetch user', error);
                    localStorage.removeItem('token');
                    setToken(null);
                }
            }
            setIsLoading(false);
        };

        initAuth();
    }, []);

    const login = async (credentials: LoginRequest) => {
        try {
            const { data, error } = await loginForAccessTokenUsersTokenPost({
                body: credentials,
                headers: { 'X-API-Key': API_KEY }
            });

            if (error) {
                throw new Error('Login failed');
            }

            if (data) {
                const accessToken = data.access_token;
                localStorage.setItem('token', accessToken);
                setToken(accessToken);
                // Fetch user details
                const userResponse = await readUsersMeUsersMeGet({
                    headers: { 'X-API-Key': API_KEY }
                });
                if (userResponse.data) {
                    setUser(userResponse.data);
                }
            }
        } catch (error) {
            console.error('Login error', error);
            throw error;
        }
    };

    const logout = () => {
        localStorage.removeItem('token');
        setUser(null);
        setToken(null);
    };

    const refreshUser = async () => {
        if (!token) return;
        try {
            const userResponse = await readUsersMeUsersMeGet({
                headers: { 'X-API-Key': API_KEY }
            });
            if (userResponse.data) {
                setUser(userResponse.data);
            }
        } catch (error) {
            console.error('Failed to refresh user', error);
        }
    };

    return (
        <AuthContext.Provider value={{ user, token, isAuthenticated: !!user, isLoading, login, logout, refreshUser }}>
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
