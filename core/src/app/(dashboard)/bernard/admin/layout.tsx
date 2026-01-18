import { getSession } from "@/lib/auth/server-helpers";
import { redirect } from "next/navigation";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session || session.user.role !== "admin") {
    redirect("/403");
  }

  return children;
}
