"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

export function Filters() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [dni, setDni] = useState(searchParams.get("dni") ?? "");
  const [carPlate, setCarPlate] = useState(
    searchParams.get("car_plate") ?? ""
  );
  const [status, setStatus] = useState(searchParams.get("status") ?? "");
  const [from, setFrom] = useState(searchParams.get("from") ?? "");
  const [to, setTo] = useState(searchParams.get("to") ?? "");

  function applyParams(next: URLSearchParams) {
    startTransition(() => {
      router.replace(`/admin/citas?${next.toString()}`);
    });
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const next = new URLSearchParams();
    if (dni.trim()) next.set("dni", dni.trim());
    if (carPlate.trim()) next.set("car_plate", carPlate.trim().toUpperCase());
    if (status) next.set("status", status);
    if (from) next.set("from", from);
    if (to) next.set("to", to);
    next.set("page", "1");
    applyParams(next);
  }

  function handleClear() {
    setDni("");
    setCarPlate("");
    setStatus("");
    setFrom("");
    setTo("");
    applyParams(new URLSearchParams());
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="grid grid-cols-1 gap-3 rounded-xl border border-surface-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-6"
    >
      <Input
        label="DNI"
        name="dni"
        placeholder="12345678"
        value={dni}
        onChange={(e) => setDni(e.target.value)}
      />
      <Input
        label="Placa"
        name="car_plate"
        placeholder="ABC-123"
        value={carPlate}
        onChange={(e) => setCarPlate(e.target.value)}
      />
      <Select
        label="Estado"
        name="status"
        value={status}
        onChange={(e) => setStatus(e.target.value)}
      >
        <option value="">Todos</option>
        <option value="pendiente">Pendiente</option>
        <option value="confirmada">Confirmada</option>
        <option value="cancelada">Cancelada</option>
        <option value="completada">Completada</option>
      </Select>
      <Input
        label="Desde"
        type="date"
        name="from"
        value={from}
        onChange={(e) => setFrom(e.target.value)}
      />
      <Input
        label="Hasta"
        type="date"
        name="to"
        value={to}
        onChange={(e) => setTo(e.target.value)}
      />
      <div className="flex items-end gap-2">
        <Button type="submit" loading={isPending} className="flex-1">
          <Search className="h-4 w-4" /> Filtrar
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={handleClear}
          disabled={isPending}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </form>
  );
}
