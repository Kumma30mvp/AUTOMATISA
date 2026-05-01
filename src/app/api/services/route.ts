import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { ServiceOption } from "@/lib/types/database";

export async function GET() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("service_catalog")
    .select("id, name")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("Failed to fetch services:", error);
    return NextResponse.json<ServiceOption[]>([]);
  }

  return NextResponse.json<ServiceOption[]>(data ?? []);
}
