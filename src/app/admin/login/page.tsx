import { redirect } from "next/navigation";
import { verifySession } from "@/lib/auth/verify-session";
import { LoginForm } from "@/components/admin/LoginForm";

export const metadata = {
  title: "AUTOMATISA | Admin",
};

export default async function AdminLoginPage() {
  const staff = await verifySession();
  if (staff) {
    redirect("/admin/citas");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-50 px-4 py-12">
      <div className="w-full max-w-md rounded-xl border border-surface-200 bg-white p-8 shadow-sm">
        <div className="mb-6 text-center">
          <h1 className="font-heading text-2xl font-semibold text-navy-900">
            AUTOMATISA Admin
          </h1>
          <p className="mt-1 text-sm text-nav">
            Inicie sesión para gestionar las solicitudes de cita.
          </p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
