"use client";

import { Button } from "@/components/ui/button";
import { Syringe } from "lucide-react";
import { useFarmStore } from "../store";
import { EmptyStateMessage } from "./empty-state";
import { ReportCard, StatTile } from "./report-card";

/** Vaccination & health schedule summary. */
export function HealthReport({
  vaccinationsDue30,
  overdueVaccinations,
  last30Events,
}: {
  vaccinationsDue30: number;
  overdueVaccinations: number;
  last30Events: number;
}) {
  const setView = useFarmStore((s) => s.setView);

  return (
    <ReportCard
      title="Vaccinations & health"
      description="Schedule health and recent animal health activity"
      actions={
        <Button variant="outline" size="sm" className="min-h-9" onClick={() => setView("livestock")}>
          <Syringe className="size-4" aria-hidden />
          Open livestock
        </Button>
      }
    >
      {vaccinationsDue30 === 0 && overdueVaccinations === 0 && last30Events === 0 ? (
        <EmptyStateMessage message="No vaccination or health records yet — records will appear here as you use Farm Command." />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <StatTile
              label="Due next 30 days"
              value={vaccinationsDue30}
              tone={vaccinationsDue30 > 0 ? "gold" : "neutral"}
            />
            <StatTile
              label="Overdue vaccinations"
              value={overdueVaccinations}
              tone={overdueVaccinations > 0 ? "bad" : "good"}
            />
            <StatTile label="Health events (30 days)" value={last30Events} />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {overdueVaccinations > 0
              ? `${overdueVaccinations} vaccination${overdueVaccinations === 1 ? " is" : "s are"} past the due date — open Livestock to reschedule or record it.`
              : "All recorded vaccinations are up to date or scheduled ahead."}
          </p>
        </>
      )}
    </ReportCard>
  );
}
