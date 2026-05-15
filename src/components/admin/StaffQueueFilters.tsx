"use client";

import { Search, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type ChangeEvent, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PLATE_REGEX, normalizePlate } from "@/lib/utils/plate";

const PLATE_ERROR = "Formato esperado: ABC-123 (6 caracteres alfanuméricos).";

type Props = {
  /** Current `placa` value from the URL search params, if any. Used to
   *  pre-fill the input on refresh / deep-link. */
  initialPlaca?: string;
};

/**
 * Phase 10d — staff workspace plate search.
 *
 * Submits a normalized plate to the URL (?placa=XXX-XXX&page=1) so the
 * server component re-fetches from /api/admin/staff/queue with the filter
 * applied. Pagination remains URL-driven; this component just rewrites
 * the `placa` and `page` params.
 *
 * Reuses `normalizePlate` from @/lib/utils/plate so the client and
 * server enforce identical rules — exact match on the canonical
 * `XXX-XXX` form. The util is pure (zod-free) so importing it from a
 * client component doesn't drag schema code into the browser bundle.
 */
export function StaffQueueFilters({ initialPlaca }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [value, setValue] = useState<string>(initialPlaca ?? "");
  const [error, setError] = useState<string | null>(null);

  const hasActiveSearch = Boolean(initialPlaca);

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    setValue(normalizePlate(e.target.value));
    if (error) setError(null);
  }

  function applySearch(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next) {
      params.set("placa", next);
    } else {
      params.delete("placa");
    }
    // Reset to page 1 whenever the filter changes.
    params.set("page", "1");
    router.replace(`/admin/staff?${params.toString()}`);
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const normalized = normalizePlate(value);
    if (!normalized) {
      // Empty input = clear the filter.
      setValue("");
      setError(null);
      applySearch("");
      return;
    }
    if (!PLATE_REGEX.test(normalized)) {
      setError(PLATE_ERROR);
      return;
    }
    setValue(normalized);
    setError(null);
    applySearch(normalized);
  }

  function handleClear() {
    setValue("");
    setError(null);
    applySearch("");
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="flex flex-col gap-3 rounded-xl border border-surface-200 bg-white p-4 shadow-sm sm:flex-row sm:items-end"
    >
      <div className="flex-1">
        <Input
          name="placa"
          label="Buscar por placa"
          placeholder="ABC-123"
          maxLength={7}
          autoCapitalize="characters"
          value={value}
          onChange={handleChange}
          error={error ?? undefined}
          hint={
            error
              ? undefined
              : "Acepta minúsculas y sin guion (ej. abc123 → ABC-123)."
          }
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" variant="primary" size="md">
          <Search className="h-4 w-4" />
          Buscar
        </Button>
        {hasActiveSearch && (
          <Button
            type="button"
            variant="secondary"
            size="md"
            onClick={handleClear}
          >
            <X className="h-4 w-4" />
            Limpiar
          </Button>
        )}
      </div>
    </form>
  );
}
