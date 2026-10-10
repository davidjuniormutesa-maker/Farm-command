"use client";

import { Badge } from "@/components/ui/badge";
import { formatDateShort, formatKwacha, statusBadgeClass } from "@/lib/farm";
import { EmptyStateMessage } from "./empty-state";
import { ReportCard } from "./report-card";
import type { ActiveCycle, HarvestRow } from "./report-types";

/** Crop & field summary — active cycles + harvests recorded this year. */
export function CropsReport({
  activeCycles,
  harvestedThisYear,
  fieldsCount,
  totalArea,
}: {
  activeCycles: ActiveCycle[];
  harvestedThisYear: HarvestRow[];
  fieldsCount: number;
  totalArea: number | null;
}) {
  return (
    <ReportCard
      title="Crops & fields"
      description={`${fieldsCount} field${fieldsCount === 1 ? "" : "s"}${
        totalArea ? ` · ${totalArea.toLocaleString("en-ZM", { maximumFractionDigits: 2 })} ha total` : ""
      }`}
    >
      <div className="space-y-5">
        <section>
          <h3 className="text-sm font-semibold">Active crop cycles</h3>
          {activeCycles.length === 0 ? (
            <div className="mt-2">
              <EmptyStateMessage message="No growing crops yet — plant a crop in the Crops module and it will appear here." />
            </div>
          ) : (
            <ul className="farm-scroll mt-2 max-h-52 space-y-1.5 overflow-y-auto pr-1">
              {activeCycles.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {c.crop}
                      {c.variety ? <span className="font-normal text-muted-foreground"> — {c.variety}</span> : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {c.field ? `${c.field} · ` : ""}
                      {formatDateShort(c.plantingDate)} → {formatDateShort(c.expectedHarvestDate)}
                    </p>
                  </div>
                  <Badge className={`shrink-0 border ${statusBadgeClass(c.status)}`} variant="outline">
                    {c.status}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3 className="text-sm font-semibold">Harvested this year</h3>
          {harvestedThisYear.length === 0 ? (
            <div className="mt-2">
              <EmptyStateMessage message="No harvests recorded this year yet." />
            </div>
          ) : (
            <div className="farm-scroll mt-2 max-h-48 overflow-y-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/70 text-left text-xs uppercase tracking-wide text-muted-foreground backdrop-blur">
                  <tr>
                    <th className="px-3 py-2 font-medium">Crop</th>
                    <th className="px-3 py-2 font-medium">Harvested</th>
                    <th className="px-3 py-2 text-right font-medium">Sold for</th>
                  </tr>
                </thead>
                <tbody>
                  {harvestedThisYear.map((h, i) => (
                    <tr key={`${h.crop}-${i}`} className="border-t">
                      <td className="px-3 py-2">{h.crop}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {h.quantity !== null ? `${h.quantity.toLocaleString("en-ZM")} ${h.unit ?? ""}`.trim() : "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {h.saleAmount ? formatKwacha(h.saleAmount) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </ReportCard>
  );
}
