"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  ALLOWED_TRANSITIONS,
} from "@/lib/validations/admin";
import type { AppointmentStatus } from "@/lib/types/database";

type Role = "admin" | "staff";

type Props = {
  appointmentId: string;
  currentStatus: AppointmentStatus;
  role: Role;
  onUpdated: () => void;
};

const LABELS: Record<AppointmentStatus, string> = {
  pendiente: "Marcar pendiente",
  confirmada: "Confirmar",
  cancelada: "Cancelar",
  completada: "Completar",
};

const VARIANTS: Record<
  AppointmentStatus,
  "primary" | "secondary" | "ghost" | "danger"
> = {
  pendiente: "secondary",
  confirmada: "primary",
  cancelada: "danger",
  completada: "primary",
};

export function StatusActions({
  appointmentId,
  currentStatus,
  role,
  onUpdated,
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState<AppointmentStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const successTimer = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    return () => {
      if (successTimer.current) clearTimeout(successTimer.current);
    };
  }, []);

  // Staff cannot change status — defense-in-depth UI mirror of the
  // admin-only RLS / API gate. Server-side enforcement is the real
  // boundary; the message just keeps staff from seeing buttons that
  // would 403 on click.
  if (role !== "admin") {
    return (
      <p className="text-sm text-nav">
        Las acciones de estado están reservadas para el equipo administrador.
      </p>
    );
  }

  const rawAllowed = ALLOWED_TRANSITIONS[currentStatus];

  // Phase 8 temporary guard: completion will be wired through the
  // admin "Send PDF and complete" action in Phase 10 once technical
  // reports exist. Until then, hide the direct "Completar" button so
  // admins don't bypass the report flow. Cancellation stays available.
  // Remove this filter when Phase 10 ships completion via the report
  // workflow.
  const allowed = rawAllowed.filter((target) => target !== "completada");
  const completionGuarded = rawAllowed.includes("completada");

  if (allowed.length === 0) {
    return (
      <p className="text-sm text-nav">
        Esta solicitud está en estado final ({currentStatus}).
      </p>
    );
  }

  async function handleUpdate(newStatus: AppointmentStatus) {
    setLoading(newStatus);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(
        `/api/admin/appointment-requests/${appointmentId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus }),
        }
      );
      const body = await res.json();
      if (!res.ok || !body.success) {
        setError(body.error ?? "Error al actualizar el estado");
        setLoading(null);
        return;
      }
      setSuccess("Estado actualizado correctamente");
      if (successTimer.current) clearTimeout(successTimer.current);
      successTimer.current = setTimeout(() => setSuccess(null), 3000);
      onUpdated();
      router.refresh();
    } catch {
      setError("Error de red. Intente nuevamente.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {allowed.map((target) => (
          <Button
            key={target}
            variant={VARIANTS[target]}
            size="sm"
            loading={loading === target}
            disabled={loading !== null && loading !== target}
            onClick={() => handleUpdate(target)}
          >
            {LABELS[target]}
          </Button>
        ))}
      </div>
      {completionGuarded && (
        <p className="text-xs text-nav">
          La finalización estará disponible cuando el envío del informe
          técnico al cliente esté implementado.
        </p>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
      {success && <p className="text-xs text-green-700">{success}</p>}
    </div>
  );
}
