/**
 * Client-safe auth helpers that work in Client Components.
 * These functions use client-side API calls instead of server-only APIs.
 */

export interface Session {
    user: {
        id: string;
        email: string;
        name: string;
        image?: string;
        role: string;
    };
    session?: {
        id: string;
        userId: string;
        expiresAt: Date;
    };
}

export const getSession = async (): Promise<Session | null> => {
    try {
        const response = await fetch('/api/auth/get-session', {
            method: 'GET',
            credentials: 'include',
        });

        if (!response.ok) {
            return null;
        }

        const data = await response.json();
        return data.session;
    } catch {
        return null;
    }
};

export const redirectToLogin = () => {
    if (typeof window !== 'undefined') {
        window.location.href = '/auth/login';
    }
};

export const redirectIfNotAuthenticated = async (): Promise<Session | null> => {
    const session = await getSession();

    if (!session) {
        redirectToLogin();
        return null;
    }

    return session;
};

export const redirectIfNotAdmin = async (): Promise<Session | null> => {
    const session = await getSession();

    if (!session || session.user.role !== 'admin') {
        redirectToLogin();
        return null;
    }

    return session;
};