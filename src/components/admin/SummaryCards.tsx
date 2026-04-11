import { Clock, CheckCircle2, XCircle, CheckCheck } from "lucide-react";
import type { SummaryCounts } from "@/lib/types/database";

type Card = {
  key: keyof SummaryCounts;
  label: string;
  icon: typeof Clock;
  accent: string;
};

const CARDS: Card[] = [
  {
    key: "pendiente",
    label: "Pendientes",
    icon: Clock,
    accent: "bg-amber-100 text-amber-700",
  },
  {
    key: "confirmada",
    label: "Confirmadas",
    icon: CheckCircle2,
    accent: "bg-blue-lighter text-blue-accent",
  },
  {
    key: "cancelada",
    label: "Canceladas",
    icon: XCircle,
    accent: "bg-red-100 text-red-700",
  },
  {
    key: "completada",
    label: "Completadas",
    icon: CheckCheck,
    accent: "bg-green-100 text-green-700",
  },
];

export function SummaryCards({ counts }: { counts: SummaryCounts }) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {CARDS.map(({ key, label, icon: Icon, accent }) => (
        <div
          key={key}
          className="flex items-center gap-4 rounded-xl border border-surface-200 bg-white p-4 shadow-sm"
        >
          <div
            className={`flex h-12 w-12 items-center justify-center rounded-xl ${accent}`}
          >
            <Icon className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-nav">{label}</p>
            <p className="font-heading text-2xl font-semibold text-navy-900">
              {counts[key]}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
