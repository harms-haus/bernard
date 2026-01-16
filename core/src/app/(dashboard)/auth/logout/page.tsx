"use client";

import { useEffect } from "react";
import { authClient } from "@/lib/auth/auth-client";
import { useRouter } from "next/navigation";

export default function LogoutPage() {
    const router = useRouter();

    useEffect(() => {
        const logout = async () => {
            await authClient.signOut({
                fetchOptions: {
                    onSuccess: () => {
                        router.push("/auth/login");
                    },
                },
            });
        };
        logout();
    }, [router]);

    return (
        <div className="flex items-center justify-center min-h-screen bg-slate-950 text-slate-100">
            <div className="flex flex-col items-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mb-4"></div>
                <p className="text-xl font-medium">Signing out...</p>
            </div>
        </div>
    );
}
