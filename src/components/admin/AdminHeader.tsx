"use client";

import { Home, LogOut } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";

type Role = "admin" | "staff";

type AdminHeaderProps = {
  fullName: string;
  email: string;
  role: Role;
};

const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  staff: "Staff",
};

const ROLE_CLASSES: Record<Role, string> = {
  admin: "bg-blue-lighter text-blue-accent",
  staff: "bg-surface-100 text-nav",
};

export function AdminHeader({ fullName, email, role }: AdminHeaderProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setLoading(true);
    try {
      await fetch("/api/admin/auth/logout", { method: "POST" });
    } catch {
      // ignore — we still redirect
    }
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <header className="border-b border-surface-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <div>
          <p className="font-heading text-lg font-semibold text-navy-900">
            AUTOMATISA COLABORADORES
          </p>
          <p className="text-xs text-nav">Panel de solicitudes de cita</p>
        </div>
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="hidden text-right sm:block">
            <div className="flex items-center justify-end gap-2">
              <p className="text-sm font-medium text-navy-900">{fullName}</p>
              <span
                aria-label={`Rol: ${ROLE_LABEL[role]}`}
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_CLASSES[role]}`}
              >
                {ROLE_LABEL[role]}
              </span>
            </div>
            <p className="text-xs text-nav">{email}</p>
          </div>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-lg border border-surface-200 bg-white px-3 py-1.5 text-sm font-medium text-navy-900 transition-colors hover:bg-surface-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-accent"
          >
            <Home className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">Volver al inicio</span>
            <span className="sm:hidden">Inicio</span>
          </Link>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleLogout}
            loading={loading}
          >
            <LogOut className="h-4 w-4" /> Salir
          </Button>
        </div>
      </div>
    </header>
  );
}
