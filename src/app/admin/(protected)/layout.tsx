import { redirect } from "next/navigation";
import { verifySession } from "@/lib/auth/verify-session";
import { AdminHeader } from "@/components/admin/AdminHeader";

export default async function ProtectedAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const staff = await verifySession();
  if (!staff) {
    redirect("/admin/login");
  }

  return (
    <div className="min-h-screen bg-surface-50">
      <AdminHeader fullName={staff.fullName} email={staff.email} />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
