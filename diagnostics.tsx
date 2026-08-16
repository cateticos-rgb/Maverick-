import {
  useGetInferenceDebug,
  useGetModelConfig,
  useUpdateModelConfig,
  useListAvailableModels,
  useGetSystemPrompt,
  useUpdateSystemPrompt,
  getGetModelConfigQueryKey,
  getGetInferenceDebugQueryKey,
  getGetSystemPromptQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import {
  ArrowLeft,
  RefreshCw,
  CheckCircle,
  XCircle,
  Loader2,
  ChevronDown,
  Search,
  RotateCcw,
  Save,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useMemo, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

const DEFAULT_MAVERICK_PROMPT =
  "You are Maverick — sharp, direct, and technically precise. You cut through noise, avoid padding, and give straight answers. When something is complex, you break it down clearly. Never hedge unnecessarily.";

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-5 py-3 border-b border-border/40 bg-muted/20">
      <span className="font-mono text-xs text-muted-foreground tracking-wider">
        {children}
      </span>
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex flex-col gap-1 py-4 border-b border-border/40 last:border-0">
      <span className="text-[10px] tracking-[0.2em] text-muted-foreground font-mono uppercase">
        {label}
      </span>
      {value !== undefined ? (
        <span className="text-sm font-mono break-all text-foreground">{value}</span>
      ) : (
        <span className="h-4 w-48 bg-muted/40 rounded animate-pulse" />
      )}
    </div>
  );
}

export default function DiagnosticsPage() {
  const queryClient = useQueryClient();

  // ── Model selector ────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState("");
  const [selectorOpen, setSelectorOpen] = useState(false);

  const { data: modelConfig, isLoading: configLoading } = useGetModelConfig();
  const { data: models, isLoading: modelsLoading } = useListAvailableModels();
  const updateModel = useUpdateModelConfig();

  const filteredModels = useMemo(() => {
    if (!models) return [];
    const q = searchQuery.toLowerCase();
    return q
      ? models.filter(
          (m) => m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q),
        )
      : models;
  }, [models, searchQuery]);

  const handleSelectModel = (modelId: string) => {
    updateModel.mutate(
      { data: { model: modelId } },
      {
        onSuccess: () => {
          setSelectorOpen(false);
          setSearchQuery("");
          queryClient.invalidateQueries({ queryKey: getGetModelConfigQueryKey() });
        },
      },
    );
  };

  // ── System prompt ─────────────────────────────────────────────────
  const { data: promptData, isLoading: promptLoading } = useGetSystemPrompt();
  const updatePrompt = useUpdateSystemPrompt();
  const [draftPrompt, setDraftPrompt] = useState<string>("");
  const [promptDirty, setPromptDirty] = useState(false);

  useEffect(() => {
    if (promptData && !promptDirty) {
      setDraftPrompt(promptData.prompt);
    }
  }, [promptData, promptDirty]);

  const handleSavePrompt = () => {
    updatePrompt.mutate(
      { data: { prompt: draftPrompt } },
      {
        onSuccess: () => {
          setPromptDirty(false);
          queryClient.invalidateQueries({ queryKey: getGetSystemPromptQueryKey() });
        },
      },
    );
  };

  const handleResetPrompt = () => {
    setDraftPrompt(DEFAULT_MAVERICK_PROMPT);
    setPromptDirty(true);
  };

  const handlePromptChange = (val: string) => {
    setDraftPrompt(val);
    setPromptDirty(val !== (promptData?.prompt ?? ""));
  };

  // ── Inference probe ───────────────────────────────────────────────
  const {
    data: debug,
    isLoading: debugLoading,
    isError: debugError,
    error: debugErrorObj,
    refetch: refetchDebug,
    isFetching: debugFetching,
  } = useGetInferenceDebug({ query: { queryKey: getGetInferenceDebugQueryKey(), retry: false } });

  const configuredModel = modelConfig?.model;
  const mismatch = debug && debug.configuredModel !== debug.actualModel;

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col">
      {/* Header */}
      <header className="border-b border-border/50 px-6 py-4 flex items-center gap-4 shrink-0">
        <Link href="/">
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div className="flex flex-col">
          <span className="font-mono text-xs tracking-[0.2em] font-semibold text-primary">
            DIAGNOSTICS
          </span>
          <span className="font-mono text-[9px] text-muted-foreground opacity-60">
            config &amp; inference probe
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetchDebug()}
          disabled={debugFetching}
          className="ml-auto font-mono text-xs h-8 gap-2"
        >
          {debugFetching ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5" />
          )}
          PROBE_
        </Button>
      </header>

      <main className="flex-1 flex flex-col items-center py-10 px-6 gap-6 overflow-y-auto">
        <div className="w-full max-w-xl flex flex-col gap-6">

          {/* ── Model selector ─────────────────────────────────────────── */}
          <div className="border border-border/50 rounded-lg bg-card overflow-hidden">
            <SectionHeader>ACTIVE MODEL CONFIG</SectionHeader>
            <div className="px-5 py-4 flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] tracking-[0.2em] text-muted-foreground font-mono uppercase">
                  Currently Selected
                </span>
                {configLoading ? (
                  <span className="h-4 w-64 bg-muted/40 rounded animate-pulse" />
                ) : (
                  <span className="font-mono text-sm text-primary break-all">
                    {configuredModel}
                  </span>
                )}
              </div>

              <div className="relative">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectorOpen((v) => !v)}
                  disabled={modelsLoading || updateModel.isPending}
                  className="w-full justify-between font-mono text-xs h-9 gap-2"
                >
                  {updateModel.isPending ? (
                    <><Loader2 className="w-3.5 h-3.5 animate-spin" />SAVING...</>
                  ) : modelsLoading ? (
                    <><Loader2 className="w-3.5 h-3.5 animate-spin" />LOADING MODELS...</>
                  ) : (
                    <>
                      CHANGE MODEL_
                      <ChevronDown
                        className={cn(
                          "w-3.5 h-3.5 transition-transform",
                          selectorOpen && "rotate-180",
                        )}
                      />
                    </>
                  )}
                </Button>

                {selectorOpen && (
                  <div className="absolute top-full mt-1 left-0 right-0 z-50 border border-border/60 rounded-lg bg-popover shadow-xl overflow-hidden">
                    <div className="flex items-center gap-2 px-3 py-2 border-b border-border/40">
                      <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <input
                        autoFocus
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search models..."
                        className="flex-1 bg-transparent font-mono text-xs outline-none placeholder:text-muted-foreground/50"
                      />
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                      {filteredModels.length === 0 ? (
                        <div className="px-4 py-6 text-center font-mono text-xs text-muted-foreground">
                          NO MODELS FOUND
                        </div>
                      ) : (
                        filteredModels.map((m) => (
                          <button
                            key={m.id}
                            onClick={() => handleSelectModel(m.id)}
                            className={cn(
                              "w-full text-left px-4 py-2.5 font-mono text-xs hover:bg-secondary/60 transition-colors flex flex-col gap-0.5",
                              configuredModel === m.id && "bg-primary/10 text-primary",
                            )}
                          >
                            <span className="truncate">{m.id}</span>
                            {m.name !== m.id && (
                              <span className="text-[10px] text-muted-foreground truncate">
                                {m.name}
                              </span>
                            )}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── System prompt ───────────────────────────────────────────── */}
          <div className="border border-border/50 rounded-lg bg-card overflow-hidden">
            <div className="px-5 py-3 border-b border-border/40 bg-muted/20 flex items-center justify-between">
              <span className="font-mono text-xs text-muted-foreground tracking-wider">
                SYSTEM PROMPT
              </span>
              {!promptLoading && (
                <span
                  className={cn(
                    "font-mono text-[10px] px-2 py-0.5 rounded-full border",
                    promptData?.isDefault && !promptDirty
                      ? "text-primary border-primary/30 bg-primary/10"
                      : "text-muted-foreground border-border/40",
                  )}
                >
                  {promptDirty ? "UNSAVED" : promptData?.isDefault ? "DEFAULT" : "CUSTOM"}
                </span>
              )}
            </div>

            <div className="px-5 py-4 flex flex-col gap-3">
              {promptLoading ? (
                <div className="h-28 bg-muted/40 rounded animate-pulse" />
              ) : (
                <textarea
                  value={draftPrompt}
                  onChange={(e) => handlePromptChange(e.target.value)}
                  rows={6}
                  className="w-full bg-muted/20 border border-border/40 rounded-md px-3 py-2.5 font-mono text-xs text-foreground resize-none outline-none focus:border-primary/50 focus:bg-muted/30 transition-colors placeholder:text-muted-foreground/40 leading-relaxed"
                  placeholder="Enter a system prompt…"
                />
              )}

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResetPrompt}
                  disabled={updatePrompt.isPending || promptLoading}
                  className="font-mono text-xs h-8 gap-1.5 text-muted-foreground"
                >
                  <RotateCcw className="w-3 h-3" />
                  RESET TO DEFAULT_
                </Button>
                <Button
                  size="sm"
                  onClick={handleSavePrompt}
                  disabled={
                    !promptDirty || updatePrompt.isPending || promptLoading
                  }
                  className="ml-auto font-mono text-xs h-8 gap-1.5"
                >
                  {updatePrompt.isPending ? (
                    <><Loader2 className="w-3 h-3 animate-spin" />SAVING...</>
                  ) : (
                    <><Save className="w-3 h-3" />SAVE PROMPT_</>
                  )}
                </Button>
              </div>

              {updatePrompt.isSuccess && !promptDirty && (
                <div className="flex items-center gap-1.5 text-primary font-mono text-[10px]">
                  <Sparkles className="w-3 h-3" />
                  PROMPT SAVED — active on next message
                </div>
              )}
            </div>
          </div>

          {/* ── Inference probe ─────────────────────────────────────────── */}
          <div className="border border-border/50 rounded-lg bg-card overflow-hidden">
            <div className="px-5 py-3 border-b border-border/40 flex items-center gap-2 bg-muted/20">
              {debugLoading || debugFetching ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
              ) : debugError ? (
                <XCircle className="w-3.5 h-3.5 text-destructive" />
              ) : (
                <CheckCircle className="w-3.5 h-3.5 text-primary" />
              )}
              <span className="font-mono text-xs text-muted-foreground tracking-wider">
                {debugLoading
                  ? "PROBING PROVIDER..."
                  : debugError
                    ? "PROBE FAILED"
                    : "PROBE COMPLETE"}
              </span>
            </div>

            <div className="px-5">
              <Row
                label="1 — Configured Model"
                value={debugLoading ? undefined : debug?.configuredModel}
              />
              <Row
                label="2 — Actual Model (from provider response)"
                value={debugLoading ? undefined : debugError ? "—" : debug?.actualModel}
              />
              <Row
                label="3 — Provider"
                value={debugLoading ? undefined : debugError ? "—" : debug?.provider}
              />
            </div>

            {debugError && (
              <div className="px-5 py-4 bg-destructive/10 border-t border-destructive/20">
                <p className="font-mono text-xs text-destructive break-all">
                  {(debugErrorObj as { data?: { error?: string } })?.data?.error ??
                    "Probe failed — check server logs"}
                </p>
              </div>
            )}
          </div>

          {/* ── Status banners ──────────────────────────────────────────── */}
          {mismatch && (
            <div className="border border-yellow-500/30 bg-yellow-500/10 rounded-lg px-5 py-4">
              <p className="font-mono text-xs text-yellow-400">
                MISMATCH DETECTED — configured model alias resolved to a different versioned model
              </p>
            </div>
          )}

          {!debugLoading && !debugError && debug && !mismatch && (
            <div className="border border-primary/30 bg-primary/5 rounded-lg px-5 py-4">
              <p className="font-mono text-xs text-primary">
                CONFIG VERIFIED — provider is serving the configured model
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
