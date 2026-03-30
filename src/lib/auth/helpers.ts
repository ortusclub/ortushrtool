import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { User, UserRole } from "@/types/database";
import { hasRole } from "@/lib/utils";

export async function getAuthUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return user;
}

export async function getCurrentUser(): Promise<User> {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) redirect("/login");

  const { data: user, error } = await supabase
    .from("users")
    .select("*")
    .eq("id", authUser.id)
    .single();

  if (error || !user) redirect("/login");
  return user as User;
}

export async function requireRole(minimumRole: UserRole): Promise<User> {
  const user = await getCurrentUser();
  if (!hasRole(user.role, minimumRole)) {
    redirect("/");
  }
  return user;
}
