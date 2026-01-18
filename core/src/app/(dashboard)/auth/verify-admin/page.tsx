import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/server-helpers";

export default async function VerifyAdminPage({
  request,
  searchParams,
}: {
  request: Request;
  searchParams: Promise<{ redirectTo?: string }>;
}) {
  const params = await searchParams;
  const redirectTo = params.redirectTo || "/bernard/admin";

  const session = await getSession();

  if (!session || session.user.role !== "admin") {
    // Not authenticated or not admin - redirect to login
    const origin = new URL(request.url).origin;
    const loginUrl = new URL("/auth/login", origin);
    loginUrl.searchParams.set("redirectTo", redirectTo);
    return Response.redirect(loginUrl);
  }

  // Admin verified - redirect to original destination
  redirect(redirectTo);
}
