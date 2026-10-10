"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { apiGet, qk } from "@/lib/api";
import type { AnimalDTO, CropCycleDTO, FieldDTO, FinanceTransactionDTO, TaskDTO } from "@/lib/farm";
import { formatDate, formatKwacha, computeTaskStatus, TASK_STATUS_LABEL } from "@/lib/farm";
import { useFarmStore, type FarmView } from "@/components/farm/store";
import { Milk, Wheat, Sprout, CalendarDays, Wallet, Search } from "lucide-react";

interface SearchHit {
  id: string;
  group: string;
  label: string;
  sub: string;
  view: FarmView;
  icon: React.ElementType;
}

export function GlobalSearchDialog() {
  const searchOpen = useFarmStore((s) => s.searchOpen);
  const setSearchOpen = useFarmStore((s) => s.setSearchOpen);
  const setView = useFarmStore((s) => s.setView);

  const { data: animals } = useQuery({ queryKey: qk.animals, queryFn: () => apiGet<AnimalDTO[]>("/api/animals"), enabled: searchOpen });
  const { data: tasks } = useQuery({ queryKey: qk.tasks, queryFn: () => apiGet<TaskDTO[]>("/api/tasks"), enabled: searchOpen });
  const { data: crops } = useQuery({ queryKey: qk.crops, queryFn: () => apiGet<CropCycleDTO[]>("/api/crops"), enabled: searchOpen });
  const { data: fields } = useQuery({ queryKey: qk.fields, queryFn: () => apiGet<FieldDTO[]>("/api/fields"), enabled: searchOpen });
  const { data: finance } = useQuery({ queryKey: qk.finance, queryFn: () => apiGet<FinanceTransactionDTO[]>("/api/finance"), enabled: searchOpen });

  const hits = useMemo<SearchHit[]>(() => {
    const out: SearchHit[] = [];
    for (const a of animals ?? []) {
      out.push({
        id: `a-${a.id}`, group: "Livestock",
        label: `${a.tagId}${a.name ? ` — ${a.name}` : ""}`,
        sub: `${a.species}${a.breed ? ` · ${a.breed}` : ""}`,
        view: "livestock", icon: Milk,
      });
    }
    for (const t of tasks ?? []) {
      out.push({
        id: `t-${t.id}`, group: "Tasks", label: t.title,
        sub: `${TASK_STATUS_LABEL[computeTaskStatus(t)]} · due ${formatDate(t.dueDate)}`,
        view: "tasks", icon: CalendarDays,
      });
    }
    for (const c of crops ?? []) {
      out.push({
        id: `c-${c.id}`, group: "Crops",
        label: `${c.crop}${c.variety ? ` — ${c.variety}` : ""}`,
        sub: `Status: ${c.status}`, view: "crops", icon: Sprout,
      });
    }
    for (const f of fields ?? []) {
      out.push({
        id: `f-${f.id}`, group: "Fields", label: f.name,
        sub: f.areaHa ? `${f.areaHa} ha${f.location ? ` · ${f.location}` : ""}` : "Field",
        view: "crops", icon: Wheat,
      });
    }
    for (const t of finance ?? []) {
      out.push({
        id: `x-${t.id}`, group: "Finances", label: t.description,
        sub: `${t.type === "income" ? "+" : "−"}${formatKwacha(t.amount)} · ${formatDate(t.date)}`,
        view: "finances", icon: Wallet,
      });
    }
    return out.slice(0, 40);
  }, [animals, tasks, crops, fields, finance]);

  const openDialog = (next: boolean) => {
    setSearchOpen(next);
  };

  return (
    <CommandDialog key={String(searchOpen)} open={searchOpen} onOpenChange={openDialog}>
      <div className="flex items-center gap-2 border-b px-3">
        <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <CommandInput placeholder="Search animals, tasks, crops, fields, transactions…" />
      </div>
      <CommandList className="farm-scroll max-h-[60vh]">
        <CommandEmpty>No matches found on the farm.</CommandEmpty>
        {["Livestock", "Tasks", "Crops", "Fields", "Finances"].map((group) => {
          const groupHits = hits.filter((h) => h.group === group);
          if (groupHits.length === 0) return null;
          return (
            <CommandGroup key={group} heading={group}>
              {groupHits.map((hit) => (
                <CommandItem
                  key={hit.id}
                  value={`${hit.label} ${hit.sub}`}
                  onSelect={() => {
                    setView(hit.view);
                    openDialog(false);
                  }}
                  className="gap-3 py-2.5"
                >
                  <hit.icon className="size-4 text-primary" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{hit.label}</div>
                    <div className="truncate text-xs text-muted-foreground">{hit.sub}</div>
                  </div>
                  <Badge variant="outline" className="shrink-0 text-[10px]">{hit.group}</Badge>
                </CommandItem>
              ))}
            </CommandGroup>
          );
        })}
      </CommandList>
    </CommandDialog>
  );
}
