"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  ALLOWED_TRANSITIONS,
} from "@/lib/validations/admin";
import type { AppointmentStatus } from "@/lib/types/database";

type Props = {
  appointmentId: string;
  currentStatus: AppointmentStatus;
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

  const allowed = ALLOWED_TRANSITIONS[currentStatus];

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
      {error && <p className="text-xs text-red-600">{error}</p>}
      {success && <p className="text-xs text-green-700">{success}</p>}
    </div>
  );
}
