"use client";

import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { CheckCircle2, AlertTriangle, Send } from "lucide-react";
import {
  DOCUMENT_TYPES,
  getTodayInLima,
  publicAppointmentFormSchema,
  type DocumentType,
} from "@/lib/validations/appointment";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import type {
  ServiceOption,
  ApiSuccessResponse,
  ApiErrorResponse,
} from "@/lib/types/database";

type FormState = {
  full_name: string;
  document_type: DocumentType;
  document_number: string;
  phone: string;
  car_plate: string;
  problem_description: string;
  vehicle_brand: string;
  vehicle_model: string;
  service_id: string;
  preferred_date: string;
};

type FieldErrors = Record<string, string>;

const INITIAL_FORM: FormState = {
  full_name: "",
  document_type: "DNI",
  document_number: "",
  phone: "",
  car_plate: "",
  problem_description: "",
  vehicle_brand: "",
  vehicle_model: "",
  service_id: "",
  preferred_date: "",
};

const SUNDAY_MESSAGE =
  "Los domingos no atendemos. Por favor seleccione otro día.";

function formatPhone(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 9);
}

function formatPlate(raw: string): string {
  const cleaned = raw
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase()
    .slice(0, 6);
  if (cleaned.length <= 3) return cleaned;
  return `${cleaned.slice(0, 3)}-${cleaned.slice(3)}`;
}

function formatDocumentNumber(raw: string, type: DocumentType): string {
  const max = type === "DNI" ? 8 : 11;
  return raw.replace(/\D/g, "").slice(0, max);
}

function isSundayDate(dateStr: string): boolean {
  if (!dateStr) return false;
  const parts = dateStr.split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return false;
  const [y, m, d] = parts;
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 0;
}

export default function AppointmentForm() {
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<{
    message: string;
    warnings: string[];
  } | null>(null);
  const [services, setServices] = useState<ServiceOption[]>([]);

  const todayInLima = useMemo(() => getTodayInLima(), []);

  useEffect(() => {
    fetch("/api/services")
      .then((r) => r.json())
      .then((data: ServiceOption[]) => {
        if (Array.isArray(data)) setServices(data);
      })
      .catch(() => {});
  }, []);

  function clearError(field: keyof FormState) {
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }

  function setField<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
    clearError(field);
  }

  function handleDocumentTypeChange(e: ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as DocumentType;
    setForm((prev) => ({
      ...prev,
      document_type: next,
      document_number: formatDocumentNumber(prev.document_number, next),
    }));
    setErrors((prev) => {
      const n = { ...prev };
      delete n.document_type;
      delete n.document_number;
      return n;
    });
  }

  function handleDocumentNumberChange(e: ChangeEvent<HTMLInputElement>) {
    const normalized = formatDocumentNumber(e.target.value, form.document_type);
    setField("document_number", normalized);
  }

  function handlePhoneChange(e: ChangeEvent<HTMLInputElement>) {
    setField("phone", formatPhone(e.target.value));
  }

  function handlePlateChange(e: ChangeEvent<HTMLInputElement>) {
    setField("car_plate", formatPlate(e.target.value));
  }

  function handleDateChange(e: ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setForm((prev) => ({ ...prev, preferred_date: v }));
    if (!v) {
      clearError("preferred_date");
      return;
    }
    if (isSundayDate(v)) {
      setErrors((prev) => ({ ...prev, preferred_date: SUNDAY_MESSAGE }));
    } else {
      clearError("preferred_date");
    }
  }

  function buildPayload() {
    const payload: Record<string, string> = {
      document_type: form.document_type,
      document_number: form.document_number.trim(),
      phone: form.phone.trim(),
      car_plate: form.car_plate.trim(),
      problem_description: form.problem_description.trim(),
    };
    const full_name = form.full_name.trim();
    if (full_name) payload.full_name = full_name;
    const vehicle_brand = form.vehicle_brand.trim();
    if (vehicle_brand) payload.vehicle_brand = vehicle_brand;
    const vehicle_model = form.vehicle_model.trim();
    if (vehicle_model) payload.vehicle_model = vehicle_model;
    if (form.service_id) payload.service_id = form.service_id;
    if (form.preferred_date) payload.preferred_date = form.preferred_date;
    return payload;
  }

  function validateClient(): boolean {
    const payload = buildPayload();
    const result = publicAppointmentFormSchema.safeParse(payload);
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
      setServerError(
        "Error de conexión. Verifique su internet e intente nuevamente."
      );
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

  const docNumberMax = form.document_type === "DNI" ? 8 : 11;
  const docNumberPlaceholder =
    form.document_type === "DNI" ? "12345678" : "12345678901";
  const docError = errors.document_type ?? errors.document_number ?? null;

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
                onChange={(e) => setField("full_name", e.target.value)}
                error={errors.full_name}
                disabled={loading}
              />

              {/* Documento: tipo (DNI/RUC) + número en una sola celda */}
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="document_number"
                  className="text-sm font-medium text-navy-900"
                >
                  Documento *
                </label>
                <div className="flex gap-2">
                  <select
                    id="document_type"
                    name="document_type"
                    value={form.document_type}
                    onChange={handleDocumentTypeChange}
                    disabled={loading}
                    aria-invalid={errors.document_type ? "true" : undefined}
                    className={`w-24 shrink-0 rounded-xl border bg-white px-3 py-2 text-sm text-navy-900 focus:border-blue-accent focus:outline-none focus:ring-2 focus:ring-blue-accent/20 disabled:cursor-not-allowed disabled:bg-surface-100 ${
                      errors.document_type
                        ? "border-red-500"
                        : "border-surface-200"
                    }`}
                  >
                    {DOCUMENT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  <input
                    id="document_number"
                    name="document_number"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder={docNumberPlaceholder}
                    maxLength={docNumberMax}
                    value={form.document_number}
                    onChange={handleDocumentNumberChange}
                    disabled={loading}
                    aria-invalid={errors.document_number ? "true" : undefined}
                    className={`flex-1 rounded-xl border bg-white px-3 py-2 text-sm text-navy-900 placeholder:text-muted focus:border-blue-accent focus:outline-none focus:ring-2 focus:ring-blue-accent/20 disabled:cursor-not-allowed disabled:bg-surface-100 ${
                      errors.document_number
                        ? "border-red-500"
                        : "border-surface-200"
                    }`}
                  />
                </div>
                {docError && (
                  <p className="text-xs text-red-600">{docError}</p>
                )}
              </div>

              {/* Teléfono con prefijo +51 visual */}
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="phone"
                  className="text-sm font-medium text-navy-900"
                >
                  Teléfono *
                </label>
                <div
                  className={`flex items-stretch overflow-hidden rounded-xl border bg-white focus-within:border-blue-accent focus-within:ring-2 focus-within:ring-blue-accent/20 ${
                    errors.phone ? "border-red-500" : "border-surface-200"
                  } ${loading ? "bg-surface-100" : ""}`}
                >
                  <span className="flex shrink-0 select-none items-center border-r border-surface-200 bg-surface-100 px-3 text-sm font-medium text-nav">
                    +51
                  </span>
                  <input
                    id="phone"
                    name="phone"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    placeholder="999 999 999"
                    maxLength={9}
                    value={form.phone}
                    onChange={handlePhoneChange}
                    disabled={loading}
                    aria-invalid={errors.phone ? "true" : undefined}
                    className="w-full bg-transparent px-3 py-2 text-sm text-navy-900 placeholder:text-muted focus:outline-none disabled:cursor-not-allowed disabled:bg-surface-100"
                  />
                </div>
                {!errors.phone && (
                  <p className="text-xs text-muted">
                    Ingrese 9 dígitos. Agregamos +51 automáticamente.
                  </p>
                )}
                {errors.phone && (
                  <p className="text-xs text-red-600">{errors.phone}</p>
                )}
              </div>

              <Input
                label="Placa del vehículo *"
                name="car_plate"
                placeholder="ABC-123"
                maxLength={7}
                autoCapitalize="characters"
                value={form.car_plate}
                onChange={handlePlateChange}
                error={errors.car_plate}
                hint="Formato ABC-123. Se ajusta automáticamente."
                disabled={loading}
              />

              {services.length > 0 ? (
                <Select
                  label="Servicio requerido"
                  name="service_id"
                  value={form.service_id}
                  onChange={(e) => setField("service_id", e.target.value)}
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
                onChange={(e) => setField("vehicle_brand", e.target.value)}
                error={errors.vehicle_brand}
                disabled={loading}
              />

              <Input
                label="Modelo del vehículo"
                name="vehicle_model"
                placeholder="Corolla, Accent, etc."
                value={form.vehicle_model}
                onChange={(e) => setField("vehicle_model", e.target.value)}
                error={errors.vehicle_model}
                disabled={loading}
              />

              <Input
                label="Fecha preferida"
                type="date"
                name="preferred_date"
                min={todayInLima}
                value={form.preferred_date}
                onChange={handleDateChange}
                error={errors.preferred_date}
                hint="No atendemos domingos."
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
                  onChange={(e) =>
                    setField("problem_description", e.target.value)
                  }
                  disabled={loading}
                  aria-invalid={
                    errors.problem_description ? "true" : undefined
                  }
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
