"use client";
import { useSearchParams } from "next/navigation";
import { Download } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

export function ExportLinks({ reports }: { reports: { id: string; label: string }[] }) {
  const sp = useSearchParams();
  const qs = sp.toString();
  return (
    <div className="flex flex-wrap gap-2">
      {reports.map((r) => (
        <a key={r.id} href={`/api/export/${r.id}${qs ? `?${qs}` : ""}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
          <Download /> {r.label}
        </a>
      ))}
    </div>
  );
}
