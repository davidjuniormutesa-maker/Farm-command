"use client";

/**
 * GuideView — a plain-English, in-app usage guide ("How to use Farm Command").
 * Fully offline: static help content, no data fetching. Written for a first-time
 * user who is not technical.
 */

import { useState } from "react";
import {
  BookOpen,
  Beef,
  Bird,
  Sprout,
  BellRing,
  Wallet,
  BarChart3,
  Download,
  WifiOff,
  Users,
  Search,
  Smartphone,
  ChevronDown,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface GuideSection {
  icon: React.ElementType;
  title: string;
  summary: string;
  points: string[];
}

const SECTIONS: GuideSection[] = [
  {
    icon: Smartphone,
    title: "Getting started",
    summary: "The basics of moving around the app.",
    points: [
      "Use the menu on the left (or the bar along the bottom on a phone) to move between sections.",
      "Tap the \u2630 menu button on a phone to see every section, including More.",
      "The big greeting at the top shows who is using the app and today\u2019s date.",
      "Most \u2018Add\u2019 buttons sit in the top-right of each section.",
    ],
  },
  {
    icon: Beef,
    title: "Livestock",
    summary: "Record your cattle, goats, sheep and pigs.",
    points: [
      "Tap Add Group and pick the animal type (Cattle, Goats, Sheep, Pigs). The form opens ready-filled for that animal.",
      "A group is a herd \u2014 you can note how many bulls, cows, calves and so on.",
      "Tap Add Animal to track a single animal by tag, with its weight and history.",
      "Record health events and vaccinations \u2014 the app makes reminders for next-due dates automatically.",
    ],
  },
  {
    icon: Bird,
    title: "Poultry",
    summary: "Chickens, ducks and daily eggs.",
    points: [
      "Poultry has its own section because of eggs.",
      "Add a flock, then record how many eggs you collect each day.",
      "The app adds up eggs for today, the last 7 days and overall.",
    ],
  },
  {
    icon: Sprout,
    title: "Crops & Fields",
    summary: "Plant, grow and harvest.",
    points: [
      "Add your fields first, then start a crop cycle on a field.",
      "Record planting and expected harvest dates.",
      "When you harvest, record the quantity and any sale amount.",
    ],
  },
  {
    icon: BellRing,
    title: "Tasks & Reminders",
    summary: "Never forget a job.",
    points: [
      "Add a task with a due date and how important it is.",
      "Tasks can repeat \u2014 daily, weekly or monthly.",
      "Overdue and due-today tasks show a red number on the Tasks menu.",
    ],
  },
  {
    icon: Wallet,
    title: "Finances",
    summary: "Money in and money out, in Kwacha.",
    points: [
      "Record income (sales) and expenses (seed, feed, fuel and so on).",
      "Everything is shown in Zambian Kwacha (K).",
      "The dashboard shows this month\u2019s income and spending at a glance.",
    ],
  },
  {
    icon: BarChart3,
    title: "Reports",
    summary: "See how the farm is doing.",
    points: [
      "Reports turn your records into simple charts and summaries.",
      "Use them to see trends in weight, egg laying, rainfall and money.",
    ],
  },
  {
    icon: Download,
    title: "Export your data",
    summary: "Save a copy as Excel, Word or PDF.",
    points: [
      "Tap the Export button at the top of the app (the down-arrow icon).",
      "Choose what to export (everything, or just one section) and the format.",
      "Excel is best for working with numbers; Word for a tidy document; PDF for printing or sharing.",
      "Export works even with no internet \u2014 the file is made right on your phone.",
      "On a phone, PDF opens a print view \u2014 choose \u2018Save as PDF\u2019 to keep the file.",
    ],
  },
  {
    icon: Users,
    title: "Family profiles",
    summary: "Who is using the app.",
    points: [
      "When the app opens it asks who is using it \u2014 tap your name.",
      "The greeting then shows your name.",
      "Profiles are kept on this device only; they are not shared between phones.",
    ],
  },
  {
    icon: WifiOff,
    title: "Working offline",
    summary: "Your records are always safe.",
    points: [
      "The app works with no internet \u2014 you can keep adding records in the field.",
      "When you come back online your records sync automatically.",
      "You\u2019ll see an \u2018Offline\u2019 badge when there is no connection; nothing is lost.",
    ],
  },
  {
    icon: Search,
    title: "Search & the Assistant",
    summary: "Find things fast.",
    points: [
      "Use Search (the magnifying glass) to jump to any animal, field or record.",
      "On a computer, press Ctrl+K to open search quickly.",
      "Ask the Farm Assistant for help in plain words.",
    ],
  },
];

function GuideItem({ section }: { section: GuideSection }) {
  const [open, setOpen] = useState(false);
  const Icon = section.icon;
  return (
    <Card>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-4 text-left sm:px-5"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary" aria-hidden>
          <Icon className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold leading-tight">{section.title}</span>
          <span className="block truncate text-xs text-muted-foreground">{section.summary}</span>
        </span>
        <ChevronDown
          className={`size-5 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      {open && (
        <CardContent className="px-4 pb-4 pt-0 sm:px-5">
          <ul className="ml-1 list-disc space-y-2 pl-5 text-sm text-muted-foreground marker:text-primary">
            {section.points.map((p, i) => (
              <li key={i} className="leading-snug">
                {p}
              </li>
            ))}
          </ul>
        </CardContent>
      )}
    </Card>
  );
}

export default function GuideView() {
  return (
    <div className="flex flex-col gap-6 pb-4">
      <div>
        <h2 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary" aria-hidden>
            <BookOpen className="size-5" />
          </span>
          Help &amp; Guide
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          A quick, plain-language guide to everything Farm Command can do. Tap any topic to open it.
        </p>
      </div>

      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">New here? Start with this</CardTitle>
          <CardDescription className="leading-relaxed">
            Farm Command keeps all your farm records in one place — animals, crops, money and jobs.
            It works even without internet, so you can use it anywhere on the farm. Add records as you
            go, and the app does the counting, reminders and reports for you.
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="space-y-3">
        {SECTIONS.map((section) => (
          <GuideItem key={section.title} section={section} />
        ))}
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Still stuck? Tap “Ask the Farm Assistant” and type your question in your own words. 🌾
      </p>
    </div>
  );
}
