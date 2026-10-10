"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiSend, qk } from "@/lib/api";
import { KNOWLEDGE_TOPICS, type KnowledgeArticleItem } from "./knowledge-types";

/**
 * "Save a note" dialog — lets the farmer keep their own knowledge
 * (co-op advice, vet instructions, field observations) alongside the
 * curated reference articles. Saved locally, readable offline.
 */
export function NoteFormDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (article: KnowledgeArticleItem) => void;
}) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState<string>("Crops");
  const [source, setSource] = useState("My notes");
  const [sourceUrl, setSourceUrl] = useState("");
  const [summary, setSummary] = useState("");
  const [content, setContent] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);

  const reset = () => {
    setTitle("");
    setTopic("Crops");
    setSource("My notes");
    setSourceUrl("");
    setSummary("");
    setContent("");
    setFieldError(null);
  };

  const save = useMutation({
    mutationFn: (payload: unknown) => apiSend<KnowledgeArticleItem>("/api/knowledge", "POST", payload),
    onSuccess: (article) => {
      queryClient.invalidateQueries({ queryKey: qk.knowledge });
      toast.success(`Note saved — "${article.title}" is now on your device.`);
      reset();
      onOpenChange(false);
      onSaved?.(article);
    },
    onError: (error: Error) => {
      toast.error(error.message || "The note could not be saved.");
    },
  });

  const submit = () => {
    if (!title.trim()) return setFieldError("Give the note a title.");
    if (!summary.trim()) return setFieldError("Write a one-line summary so you can recognise it later.");
    if (!content.trim()) return setFieldError("Write the note content.");
    setFieldError(null);
    save.mutate({
      title: title.trim(),
      topic,
      source: source.trim() || "My notes",
      sourceUrl: sourceUrl.trim(),
      summary: summary.trim(),
      content: content.trim(),
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setFieldError(null);
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Save a note</DialogTitle>
          <DialogDescription>
            Keep your own farming knowledge on this device — advice from the co-op, a vet&rsquo;s
            instructions, anything worth remembering. Saved notes remain readable offline.
          </DialogDescription>
        </DialogHeader>

        <div className="farm-scroll max-h-[60vh] space-y-3.5 overflow-y-auto pr-1">
          <div className="space-y-1.5">
            <Label htmlFor="note-title">Title</Label>
            <Input
              id="note-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Vet's advice for the layer flock"
              maxLength={200}
            />
          </div>
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="note-topic">Topic</Label>
              <Select value={topic} onValueChange={setTopic}>
                <SelectTrigger id="note-topic" className="min-h-11 w-full">
                  <SelectValue placeholder="Choose a topic" />
                </SelectTrigger>
                <SelectContent>
                  {KNOWLEDGE_TOPICS.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="note-source">Source</Label>
              <Input id="note-source" value={source} onChange={(e) => setSource(e.target.value)} maxLength={200} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="note-url">
              Source link <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="note-url"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              placeholder="https://…"
              type="url"
              maxLength={500}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="note-summary">Summary</Label>
            <Input
              id="note-summary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="One line so you can recognise it later"
              maxLength={400}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="note-content">Content</Label>
            <Textarea
              id="note-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write the advice, instructions or observations here…"
              rows={6}
              className="min-h-28"
            />
          </div>
          {fieldError && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {fieldError}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" className="min-h-11" disabled={save.isPending} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="min-h-11" disabled={save.isPending} onClick={submit}>
            {save.isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
            Save note
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
