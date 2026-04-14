"use client";

import { useEffect, useState, type FormEvent } from "react";
import { CheckCircle2, AlertTriangle, Send } from "lucide-react";
import { appointmentRequestSchema } from "@/lib/validations/appointment";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import type {
  ServiceOption,
  ApiSuccessResponse,
  ApiErrorResponse,
} from "@/lib/types/database";

type FieldErrors = Record<string, string>;

const INITIAL_FORM = {
  full_name: "",
  dni: "",
  phone: "",
  email: "",
  car_plate: "",
  problem_description: "",
  vehicle_brand: "",
  vehicle_model: "",
  service_id: "",
  preferred_date: "",
  preferred_time: "",
  additional_notes: "",
};

export default function AppointmentForm() {
  const [form, setForm] = useState(INITIAL_FORM);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<{
    message: string;
    warnings: string[];
  } | null>(null);
  const [services, setServices] = useState<ServiceOption[]>([]);

  useEffect(() => {
    fetch("/api/services")
      .then((r) => r.json())
      .then((data: ServiceOption[]) => {
        if (Array.isArray(data)) setServices(data);
      })
      .catch(() => {});
  }, []);

  function set(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  }

  function buildPayload() {
    const payload: Record<string, string> = {};
    for (const [k, v] of Object.entries(form)) {
      const trimmed = v.trim();
      if (trimmed) payload[k] = trimmed;
    }
    return payload;
  }

  function validateClient(): boolean {
    const payload = buildPayload();
    const result = appointmentRequestSchema.safeParse(payload);
    if (result.success) {
      setErrors({});
      return true;
    }
    const fieldErrors: FieldErrors = {};
    for (const issue of result.error.issues) {
      const field = String(issue.path[0] ?? "");
      if (field && !fieldErrors[field]) {
        fieldErrors[field] = issue.message;
      }
    }
    setErrors(fieldErrors);
    return false;
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setServerError(null);

    if (!validateClient()) return;

    setLoading(true);
    try {
      const res = await fetch("/api/appointment-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload()),
      });

      const body = await res.json();

      if (!res.ok) {
        const err = body as ApiErrorResponse;
        if (err.details?.length) {
          const fieldErrors: FieldErrors = {};
          for (const d of err.details) {
            if (!fieldErrors[d.field]) fieldErrors[d.field] = d.message;
          }
          setErrors(fieldErrors);
        }
        setServerError(err.error ?? "Ocurrió un error. Intente nuevamente.");
        return;
      }

      const ok = body as ApiSuccessResponse;
      setSuccess({
        message: ok.message,
        warnings: ok.warnings ?? [],
      });
    } catch {
      setServerError("Error de conexión. Verifique su internet e intente nuevamente.");
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    setForm(INITIAL_FORM);
    setErrors({});
    setServerError(null);
    setSuccess(null);
  }

  const textareaClasses =
    "w-full rounded-xl border border-surface-200 bg-white px-3 py-2 text-sm text-navy-900 placeholder:text-muted focus:border-blue-accent focus:outline-none focus:ring-2 focus:ring-blue-accent/20 disabled:cursor-not-allowed disabled:bg-surface-100";

  return (
    <section id="agendar" className="bg-surface-100 py-16 lg:py-24">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        {/* ====== DESKTOP HEADER ====== */}
        <div className="mb-12 hidden lg:block">
          <div className="mb-16 flex items-end justify-between">
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold uppercase tracking-[1.2px] text-blue-accent">
                Solicitar Cita
              </span>
              <h2 className="font-heading text-[40px] font-extrabold leading-[1.2] text-navy-900">
                Solicite su cita en línea
              </h2>
            </div>
            <p className="max-w-md pb-2 text-base leading-relaxed text-body">
              Complete el formulario y nuestro equipo le contactará para
              confirmar. También puede agendar vía{" "}
              <a
                href="https://wa.me/51946653405?text=Hola%2C%20quiero%20agendar%20una%20cita%20en%20AUTOMATISA"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-blue-accent underline underline-offset-2"
              >
                WhatsApp
              </a>
              .
            </p>
          </div>
        </div>

        {/* ====== MOBILE HEADER ====== */}
        <div className="mb-10 lg:hidden">
          <div className="flex flex-col items-center gap-3">
            <span className="text-center font-heading text-sm font-bold uppercase tracking-[2.8px] text-blue-accent">
              Solicitar Cita
            </span>
            <h2 className="text-center font-heading text-[30px] font-extrabold text-navy-900">
              Solicite su cita en línea
            </h2>
            <p className="text-center text-sm leading-relaxed text-body">
              Complete el formulario y le contactaremos para confirmar.
            </p>
          </div>
        </div>

        {success ? (
          /* ====== SUCCESS STATE ====== */
          <div className="mx-auto max-w-2xl rounded-2xl bg-white p-8 shadow-sm lg:p-12">
            <div className="flex flex-col items-center gap-6 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                <CheckCircle2 className="h-8 w-8 text-green-600" />
              </div>
              <p className="text-lg font-medium leading-relaxed text-navy-900">
                {success.message}
              </p>
              {success.warnings.length > 0 && (
                <div className="flex w-full flex-col gap-2">
                  {success.warnings.map((w, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2 rounded-lg bg-amber-50 px-4 py-3 text-left text-sm text-amber-800"
                    >
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{w}</span>
                    </div>
                  ))}
                </div>
              )}
              <Button variant="secondary" onClick={handleReset}>
                Enviar otra solicitud
              </Button>
            </div>
          </div>
        ) : (
          /* ====== FORM ====== */
          <form
            onSubmit={handleSubmit}
            noValidate
            className="rounded-2xl bg-white p-6 shadow-sm lg:p-10"
          >
            <p className="mb-6 text-xs text-nav">
              Los campos marcados con * son obligatorios.
            </p>

            <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
              <Input
                label="Nombre completo"
                name="full_name"
                placeholder="Juan Pérez"
                value={form.full_name}
                onChange={(e) => set("full_name", e.target.value)}
                error={errors.full_name}
                disabled={loading}
              />
              <Input
                label="DNI *"
                name="dni"
                placeholder="12345678"
                maxLength={8}
                value={form.dni}
                onChange={(e) => set("dni", e.target.value)}
                error={errors.dni}
                disabled={loading}
              />
              <Input
                label="Correo electrónico *"
                type="email"
                name="email"
                placeholder="correo@ejemplo.com"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                error={errors.email}
                disabled={loading}
              />
              <Input
                label="Teléfono *"
                type="tel"
                name="phone"
                placeholder="+51 999 999 999"
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
                error={errors.phone}
                disabled={loading}
              />
              <Input
                label="Placa del vehículo *"
                name="car_plate"
                placeholder="ABC-123"
                maxLength={10}
                value={form.car_plate}
                onChange={(e) => set("car_plate", e.target.value)}
                error={errors.car_plate}
                disabled={loading}
              />
              {services.length > 0 ? (
                <Select
                  label="Servicio requerido"
                  name="service_id"
                  value={form.service_id}
                  onChange={(e) => set("service_id", e.target.value)}
                  disabled={loading}
                >
                  <option value="">Seleccione un servicio (opcional)</option>
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              ) : (
                <div />
              )}
              <Input
                label="Marca del vehículo"
                name="vehicle_brand"
                placeholder="Toyota, Hyundai, etc."
                value={form.vehicle_brand}
                onChange={(e) => set("vehicle_brand", e.target.value)}
                error={errors.vehicle_brand}
                disabled={loading}
              />
              <Input
                label="Modelo del vehículo"
                name="vehicle_model"
                placeholder="Corolla, Accent, etc."
                value={form.vehicle_model}
                onChange={(e) => set("vehicle_model", e.target.value)}
                error={errors.vehicle_model}
                disabled={loading}
              />
              <Input
                label="Fecha preferida"
                type="date"
                name="preferred_date"
                value={form.preferred_date}
                onChange={(e) => set("preferred_date", e.target.value)}
                error={errors.preferred_date}
                disabled={loading}
              />
              <Input
                label="Hora preferida"
                type="time"
                name="preferred_time"
                value={form.preferred_time}
                onChange={(e) => set("preferred_time", e.target.value)}
                error={errors.preferred_time}
                disabled={loading}
              />

              {/* problem_description — full width textarea */}
              <div className="flex flex-col gap-1 sm:col-span-2">
                <label
                  htmlFor="problem_description"
                  className="text-sm font-medium text-navy-900"
                >
                  Descripción del problema *
                </label>
                <textarea
                  id="problem_description"
                  name="problem_description"
                  rows={4}
                  placeholder="Describa el problema o servicio que necesita..."
                  value={form.problem_description}
                  onChange={(e) => set("problem_description", e.target.value)}
                  disabled={loading}
                  aria-invalid={errors.problem_description ? "true" : undefined}
                  className={`${textareaClasses} ${
                    errors.problem_description ? "border-red-500" : ""
                  }`}
                />
                {errors.problem_description && (
                  <p className="text-xs text-red-600">
                    {errors.problem_description}
                  </p>
                )}
              </div>

              {/* additional_notes — full width textarea */}
              <div className="flex flex-col gap-1 sm:col-span-2">
                <label
                  htmlFor="additional_notes"
                  className="text-sm font-medium text-navy-900"
                >
                  Notas adicionales
                </label>
                <textarea
                  id="additional_notes"
                  name="additional_notes"
                  rows={3}
                  placeholder="Cualquier información adicional que considere relevante..."
                  value={form.additional_notes}
                  onChange={(e) => set("additional_notes", e.target.value)}
                  disabled={loading}
                  className={textareaClasses}
                />
              </div>
            </div>

            {serverError && (
              <div className="mt-5 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
                {serverError}
              </div>
            )}

            <div className="mt-8">
              <Button
                type="submit"
                loading={loading}
                className="w-full sm:w-auto"
              >
                <Send className="h-4 w-4" />
                Enviar solicitud
              </Button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
