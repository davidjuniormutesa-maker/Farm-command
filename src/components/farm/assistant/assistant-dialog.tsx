"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bot, Loader2, Send, Sparkles, TriangleAlert, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { apiGet, apiSend, qk } from "@/lib/api";
import type { FarmSettingsData } from "@/lib/farm";
import { useFarmStore } from "@/components/farm/store";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = [
  "Summarise my farm in a few sentences",
  "What should I do today?",
  "Explain fall armyworm in simple words",
  "How can I improve my soil between maize seasons?",
];

export function FarmAssistantDialog() {
  const queryClient = useQueryClient();
  const open = useFarmStore((s) => s.assistantOpen);
  const onOpenChange = useFarmStore((s) => s.setAssistantOpen);
  const { data: settings } = useQuery({ queryKey: qk.settings, queryFn: () => apiGet<FarmSettingsData>("/api/settings"), enabled: open });
  const aiEnabled = settings?.aiEnabled ?? false;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [enabling, setEnabling] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      // keep the newest message visible (subscription-style via rAF, no state writes)
      const el = listRef.current;
      if (el) requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
    }
  }, [open, messages.length, sending]);

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || sending) return;
    setErrorMsg(null);
    const next: ChatMessage[] = [...messages, { role: "user", content }];
    setMessages(next);
    setInput("");
    setSending(true);
    try {
      const res = await apiSend<{ reply: string }>("/api/ai", "POST", {
        messages: next.filter((m) => m.role === "user" || m.role === "assistant").slice(-12),
      });
      setMessages([...next, { role: "assistant", content: res.reply }]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "The assistant is unavailable right now.";
      setErrorMsg(msg);
      setMessages(next); // keep the user's message visible; error shown below
    } finally {
      setSending(false);
    }
  };

  const enableAssistant = async () => {
    setEnabling(true);
    try {
      await apiSend("/api/settings", "PATCH", { aiEnabled: true });
      await queryClient.invalidateQueries({ queryKey: qk.settings });
      toast.success("Assistant enabled — it uses the internet, but your records stay on this device.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not enable the assistant");
    } finally {
      setEnabling(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!sending) onOpenChange(o); }}>
      <DialogContent className="flex h-[85vh] max-h-[720px] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle className="flex items-center gap-2 pr-7 text-base">
            <span className="flex size-8 items-center justify-center rounded-xl bg-primary/10"><Sparkles className="size-4 text-primary" aria-hidden /></span>
            Farm Assistant
            <span className="ml-auto inline-flex items-center gap-1 rounded-full border bg-muted/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {aiEnabled ? "Online · beta" : "Off"}
            </span>
          </DialogTitle>
          <DialogDescription className="text-xs">
            General farming guidance with your farm in mind — never a veterinarian. Verify important decisions locally.
          </DialogDescription>
        </DialogHeader>

        {/* Messages */}
        <div ref={listRef} className="farm-scroll flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
          {messages.length === 0 && !errorMsg && (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
              {!aiEnabled ? (
                <>
                  <span className="flex size-14 items-center justify-center rounded-2xl bg-primary/10"><Sparkles className="size-7 text-primary" aria-hidden /></span>
                  <div className="max-w-sm">
                    <p className="font-semibold">Your optional AI helper</p>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      It can summarise your records, explain farming concepts and help draft tasks — using the internet.
                      Everything stays on this device. Turn it off any time in Settings.
                    </p>
                  </div>
                  <Button onClick={enableAssistant} disabled={enabling || settings === undefined} className="min-h-11">
                    {enabling ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
                    {enabling ? "Enabling…" : "Turn on the assistant"}
                  </Button>
                </>
              ) : (
                <>
                  <span className="flex size-14 items-center justify-center rounded-2xl bg-primary/10"><Bot className="size-7 text-primary" aria-hidden /></span>
                  <div className="max-w-sm text-sm text-muted-foreground">Ask anything about your farm — or start with a suggestion:</div>
                  <div className="flex max-w-md flex-wrap justify-center gap-2">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        onClick={() => send(s)}
                        className="rounded-full border bg-card px-3.5 py-2 text-xs font-medium transition-colors hover:bg-accent"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`flex gap-2.5 ${m.role === "user" ? "justify-end" : ""}`}>
              {m.role === "assistant" && (
                <span className="mt-1 flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10" aria-hidden>
                  <Bot className="size-4 text-primary" />
                </span>
              )}
              <div
                className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                  m.role === "user"
                    ? "rounded-br-md bg-primary text-primary-foreground"
                    : "rounded-bl-md border bg-card"
                }`}
              >
                {m.content}
              </div>
              {m.role === "user" && (
                <span className="mt-1 flex size-7 shrink-0 items-center justify-center rounded-lg bg-secondary" aria-hidden>
                  <User className="size-4 text-secondary-foreground" />
                </span>
              )}
            </div>
          ))}

          {sending && (
            <div className="flex gap-2.5">
              <span className="mt-1 flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10" aria-hidden>
                <Bot className="size-4 text-primary" />
              </span>
              <div className="flex items-center gap-2 rounded-2xl rounded-bl-md border bg-card px-3.5 py-2.5 text-sm text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" aria-hidden /> Thinking about your farm…
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="flex items-start gap-2.5">
              <span className="mt-1 flex size-7 shrink-0 items-center justify-center rounded-lg bg-destructive/10" aria-hidden>
                <TriangleAlert className="size-4 text-destructive" />
              </span>
              <div className="max-w-[80%] rounded-2xl rounded-bl-md border border-destructive/30 bg-destructive/5 px-3.5 py-2.5 text-sm text-destructive">
                {errorMsg}
                <Button variant="outline" size="sm" className="mt-2 h-8" onClick={() => send(messages[messages.length - 1]?.content ?? "")} disabled={sending}>
                  Try again
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="border-t px-4 py-3">
          {messages.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {SUGGESTIONS.slice(0, 2).map((s) => (
                <button key={s} onClick={() => send(s)} disabled={sending} className="rounded-full border bg-card px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent disabled:opacity-50">
                  {s}
                </button>
              ))}
            </div>
          )}
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={aiEnabled ? "Ask about your farm…" : "Assistant is off — turn it on above"}
              disabled={!aiEnabled || sending}
              aria-label="Message the farm assistant"
              className="min-h-11 flex-1"
            />
            <Button type="submit" size="icon" className="size-11 shrink-0" disabled={!aiEnabled || sending || !input.trim()} aria-label="Send message">
              <Send className="size-4" aria-hidden />
            </Button>
          </form>
          <p className="mt-1.5 text-[10px] leading-snug text-muted-foreground">
            AI answers are general guidance, may be incomplete, and never replace your vet, extension officer or own judgement.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
