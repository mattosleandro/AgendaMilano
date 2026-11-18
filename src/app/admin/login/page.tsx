import { redirect } from "next/navigation";
import React from "react";
import { AdminLoginForm } from "@/components/admin/AdminLoginForm";
import { getAdminSessionFromCookies } from "@/lib/agenda/queries";

export const dynamic = "force-dynamic";

export default async function AdminLoginPage() {
  const admin = await getAdminSessionFromCookies();
  if (admin) {
    redirect("/admin");
  }
  return <AdminLoginForm />;
}
