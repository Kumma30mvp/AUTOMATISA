"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Select } from "@/components/ui/Select";
import type {
  AppointmentStatus,
  AssignedStaffSummary,
} from "@/lib/types/database";
import type { StaffSummary, StaffListResponse } from "@/lib/types/staff";

type Role = "admin" | "staff";

type Props = {
  appointmentId: string;
  appointmentStatus: AppointmentStatus;
  currentAssignedStaff: AssignedStaffSummary | null;
  role: Role;
  onUpdated: () => void;
};

const NONE_VALUE = "__none__";

/**
 * Assignment field for an appointment.
 *
 * Admin + status='confirmada': editable <Select> populated lazily
 * from /api/admin/staff. Saves with PATCH on change. The API
 * already enforces the same status='confirmada' rule and the
 * staff-must-be-active check; this component mirrors them only
 * to disable the UI when the rules wouldn't allow a change.
 *
 * Admin + non-confirmada status: read-only label + hint that
 * assignment is only available for confirmed appointments.
 *
 * Staff (any status): read-only label with the technician name
 * or "Sin asignar". Staff cannot change assignment under any
 * circumstance.
 *
 * onUpdated is invoked after a successful save so the parent
 * can re-fetch the appointment detail (which re-resolves the
 * joined assigned_staff name).
 */
export function AssignmentField({
  appointmentId,
  appointmentStatus,
  currentAssignedStaff,
  role,
  onUpdated,
}: Props) {
  const [staffOptions, setStaffOptions] = useState<StaffSummary[] | null>(null);
  const [staffLoadError, setStaffLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [localValue, setLocalValue] = useState<string>(
    currentAssignedStaff?.id ?? NONE_VALUE
  );
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLocalValue(currentAssignedStaff?.id ?? NONE_VALUE);
  }, [currentAssignedStaff?.id]);

  useEffect(() => {
    return () => {
      if (successTimer.current) clearTimeout(successTimer.current);
    };
  }, []);

  const isAdmin = role === "admin";
  const canEdit = isAdmin && appointmentStatus === "confirmada";

  // Lazy-load the staff list only when the field is editable.
  useEffect(() => {
    if (!canEdit || staffOptions !== null) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/staff");
        const body = await res.json();
        if (!res.ok) {
          if (!cancelled) {
            setStaffLoadError(body.error ?? "Error al cargar técnicos");
          }
          return;
        }
        if (!cancelled) {
          setStaffOptions((body as StaffListResponse).data);
        }
      } catch {
        if (!cancelled) setStaffLoadError("Error de red");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canEdit, staffOptions]);

  // Read-only modes
  if (!isAdmin) {
    return (
      <div>
        <p className="text-xs uppercase tracking-wide text-nav">
          Técnico asignado
        </p>
        <p className="text-sm text-navy-900">
          {currentAssignedStaff?.full_name ?? "Sin asignar"}
        </p>
      </div>
    );
  }

  if (!canEdit) {
    return (
      <div>
        <p className="text-xs uppercase tracking-wide text-nav">
          Técnico asignado
        </p>
        <p className="text-sm text-navy-900">
          {currentAssignedStaff?.full_name ?? "Sin asignar"}
        </p>
        <p className="mt-1 text-xs text-nav">
          La asignación solo está disponible cuando la cita está confirmada.
        </p>
      </div>
    );
  }

  async function handleChange(nextValue: string) {
    const previous = localValue;
    if (nextValue === previous) return;

    setLocalValue(nextValue);
    setSaving(true);
    setError(null);
    setSuccess(null);

    const assigned_staff_id = nextValue === NONE_VALUE ? null : nextValue;

    try {
      const res = await fetch(
        `/api/admin/appointment-requests/${appointmentId}/assignment`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ assigned_staff_id }),
        }
      );
      const body = await res.json();
      if (!res.ok || !body.success) {
        setError(body.error ?? "Error al actualizar la asignación");
        setLocalValue(previous);
        setSaving(false);
        return;
      }
      setSuccess("Asignación actualizada");
      if (successTimer.current) clearTimeout(successTimer.current);
      successTimer.current = setTimeout(() => setSuccess(null), 2500);
      onUpdated();
    } catch {
      setError("Error de red. Intente nuevamente.");
      setLocalValue(previous);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <Select
        label="Técnico asignado"
        name="assigned_staff_id"
        id={`assignment-${appointmentId}`}
        value={localValue}
        onChange={(e) => handleChange(e.target.value)}
        disabled={saving || staffOptions === null}
      >
        <option value={NONE_VALUE}>Sin asignar</option>
        {(staffOptions ?? []).map((s) => (
          <option key={s.id} value={s.id}>
            {s.full_name}
          </option>
        ))}
      </Select>
      <div className="flex min-h-[1rem] items-center gap-2 text-xs">
        {saving && (
          <span className="flex items-center gap-1 text-nav">
            <Loader2 className="h-3 w-3 animate-spin" />
            Guardando…
          </span>
        )}
        {staffLoadError && !saving && (
          <span className="text-red-600">{staffLoadError}</span>
        )}
        {error && !saving && <span className="text-red-600">{error}</span>}
        {success && !saving && <span className="text-green-700">{success}</span>}
      </div>
    </div>
  );
}
