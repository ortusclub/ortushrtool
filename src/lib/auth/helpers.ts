import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { User, UserRole } from "@/types/database";
import { hasRole } from "@/lib/utils";

// Middleware already validates the JWT via supabase.auth.getUser() for every
// non-public route, so the session cookie is trustworthy by the time a page
// or layout runs. Reading the session locally here avoids a second network
// round-trip to the Supabase auth server (~500-800ms saved per request).
export const getAuthUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) redirect("/login");
  return session.user;
});

export const getCurrentUser = cache(async (): Promise<User> => {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) redirect("/login");

  const { data: user, error } = await supabase
    .from("users")
    .select("*")
    .eq("id", session.user.id)
    .single();

  if (error || !user) redirect("/login");
  return user as User;
});

export async function requireRole(minimumRole: UserRole): Promise<User> {
  const user = await getCurrentUser();
  if (!hasRole(user.role, minimumRole)) {
    redirect("/");
  }
  return user;
}
