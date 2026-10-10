"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Moon, Palette, Sun } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** Light / dark appearance toggle (next-themes). */
export function AppearanceCard() {
  const { theme, setTheme } = useTheme();
  // next-themes resolves the theme on the client — wait for mount to avoid
  // a hydration mismatch on the first render.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true));
    return () => clearTimeout(t);
  }, []);

  const current = mounted ? theme : undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Palette className="size-4 text-primary" aria-hidden />
          Appearance
        </CardTitle>
        <CardDescription>
          Dark mode is easier on the eyes early in the morning and late at night.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div
          className="grid w-full max-w-xs grid-cols-2 gap-1 rounded-xl border bg-muted/40 p-1"
          role="group"
          aria-label="Colour theme"
        >
          <button
            type="button"
            onClick={() => setTheme("light")}
            aria-pressed={current === "light"}
            className={`flex min-h-11 items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors ${
              current === "light" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Sun className="size-4" aria-hidden />
            Light
          </button>
          <button
            type="button"
            onClick={() => setTheme("dark")}
            aria-pressed={current === "dark"}
            className={`flex min-h-11 items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors ${
              current === "dark" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Moon className="size-4" aria-hidden />
            Dark
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
