"use client";

import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth/auth-client";
import { useRouter } from "@/lib/router/compat";

export function Logout() {
    const router = useRouter();
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const logout = async () => {
            try {
                await authClient.signOut({
                    fetchOptions: {
                        onSuccess: () => {
                            router.push("/auth/login");
                        },
                        onError: (err) => {
                            console.error("Sign out error:", err);
                            setError("Failed to sign out. Redirecting to login...");
                            // Still redirect even on error
                            setTimeout(() => {
                                router.push("/auth/login");
                            }, 2000);
                        },
                    },
                });
            } catch (err) {
                console.error("Sign out exception:", err);
                setError("Failed to sign out. Redirecting to login...");
                // Still redirect even on error
                setTimeout(() => {
                    router.push("/auth/login");
                }, 2000);
            }
        };
        logout();
    }, [router]);

    return (
        <div className="flex items-center justify-center min-h-screen bg-slate-950 text-slate-100">
            <div className="flex flex-col items-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mb-4"></div>
                <p className="text-xl font-medium">Signing out...</p>
                {error && (
                    <p className="text-red-400 text-sm mt-2">{error}</p>
                )}
            </div>
        </div>
    );
}
