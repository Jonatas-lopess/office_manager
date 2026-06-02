import { useState, useEffect, useRef, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { useDb } from "@/db/context";
import { useSync } from "@/db/sync-context";
import { useToast } from "@/hooks/use-toast";
import { logAction } from "@/lib/logger";
import { join } from "@tauri-apps/api/path";
import { readDir, readTextFile, exists } from "@tauri-apps/plugin-fs";
import {
  RotateCcw,
  FileText,
  Check,
  X,
  AlertCircle,
  Upload,
  Folder,
  ChevronRight,
  Database,
  Trash2,
} from "lucide-react";

// ── Constants ──────────────────────────────────────────────
const EXPECTED_TABLES = [
  "clients",
  "services",
  "payments",
  "logs",
  "tags",
  "service_tags",
];

// Tables cleared during "clear before restore" (order: dependents first)
const CLEARABLE_TABLES = [
  "payments",
  "service_tags",
  "services",
  "tags",
  "clients",
];

const CHANGE_COLUMNS = [
  "table",
  "pk",
  "cid",
  "val",
  "col_version",
  "db_version",
  "site_id",
  "cl",
  "seq",
] as const;

const BIGINT_FIELDS = new Set(["col_version", "db_version", "cl", "seq"]);

const CHUNK_SIZE = 500;

const TABLE_LABELS: Record<string, string> = {
  clients: "Clientes",
  services: "Serviços",
  payments: "Pagamentos",
  logs: "Logs",
  tags: "Etiquetas",
  service_tags: "Vínculos de Etiquetas",
};

// ── Types ──────────────────────────────────────────────────
type RestoreStep =
  | "browse"
  | "loading"
  | "schema-check"
  | "conflict"
  | "summary"
  | "applying"
  | "done"
  | "error";

interface NetworkBackup {
  name: string;
  path: string;
}

interface SchemaTableInfo {
  name: string;
  found: boolean;
  columnCount: number;
}

// ── Helpers ────────────────────────────────────────────────

/** Extract a human-readable date from the backup filename */
function formatBackupDate(filename: string): string {
  const m = filename.match(
    /changes_(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})\.json/,
  );
  if (!m) return filename;
  const [, y, mo, d, h, mi, s] = m;
  return `${d}/${mo}/${y} às ${h}:${mi}:${s}`;
}

/**
 * Convert a crsql_changes object (from execO + JSON) back into
 * the positional array that INSERT INTO crsql_changes expects.
 *
 * Backup serialization quirks handled:
 * - BigInts stored as plain strings ("42") → BigInt(42)
 * - site_id Uint8Array degraded to {0:x, 1:y, ...} → Uint8Array
 */
function convertChangeRow(obj: Record<string, any>): any[] {
  return CHANGE_COLUMNS.map((col) => {
    const val = obj[col];

    if (col === "site_id") {
      if (val instanceof Uint8Array) return val;
      if (Array.isArray(val)) return new Uint8Array(val);
      if (val && typeof val === "object")
        return new Uint8Array(Object.values(val));
      return val;
    }

    if (BIGINT_FIELDS.has(col)) {
      return BigInt(val);
    }

    return val;
  });
}

// ── Component ──────────────────────────────────────────────

export function BackupRestoreDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { orm, db } = useDb();
  const { myId, connectedPeers } = useSync();
  const { toast } = useToast();

  const [step, setStep] = useState<RestoreStep>("browse");
  const [networkBackups, setNetworkBackups] = useState<NetworkBackup[]>([]);
  const [isLoadingBackups, setIsLoadingBackups] = useState(false);
  const [restoreData, setRestoreData] = useState<any[]>([]);
  const [restoreSummary, setRestoreSummary] = useState<Record<string, number>>(
    {},
  );
  const [existingCounts, setExistingCounts] = useState<Record<string, number>>(
    {},
  );
  const [schemaReport, setSchemaReport] = useState<SchemaTableInfo[]>([]);
  const [schemaValid, setSchemaValid] = useState(false);
  const [restoreProgress, setRestoreProgress] = useState({
    current: 0,
    total: 0,
  });
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [clearBeforeRestore, setClearBeforeRestore] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Reset ────────────────────────────────────────────────
  const reset = useCallback(() => {
    setStep("browse");
    setNetworkBackups([]);
    setIsLoadingBackups(false);
    setRestoreData([]);
    setRestoreSummary({});
    setExistingCounts({});
    setSchemaReport([]);
    setSchemaValid(false);
    setRestoreProgress({ current: 0, total: 0 });
    setRestoreError(null);
    setSelectedSource(null);
    setClearBeforeRestore(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  // ── Browse network backups on open ───────────────────────
  useEffect(() => {
    if (!open) return;
    reset();
    browseNetworkBackups();
  }, [open, reset]);

  async function browseNetworkBackups() {
    const updatePath = import.meta.env.VITE_UPDATE_PATH;
    if (!updatePath) return;

    setIsLoadingBackups(true);
    try {
      const backupDir = await join(updatePath, "Backups");
      if (!(await exists(backupDir))) {
        setIsLoadingBackups(false);
        return;
      }

      const entries = await readDir(backupDir);
      const files: NetworkBackup[] = [];

      for (const entry of entries) {
        if (entry.name?.endsWith(".json")) {
          files.push({
            name: entry.name,
            path: await join(backupDir, entry.name),
          });
        }
      }

      // Newest first (filename contains ISO date)
      files.sort((a, b) => b.name.localeCompare(a.name));
      setNetworkBackups(files);
    } catch (err) {
      console.error("[Restore] Failed to browse network backups:", err);
    } finally {
      setIsLoadingBackups(false);
    }
  }

  // ── Process backup content ───────────────────────────────
  async function processBackupData(jsonString: string) {
    setStep("loading");

    try {
      const parsed = JSON.parse(jsonString);

      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error("Arquivo de backup vazio ou formato inválido.");
      }

      // Validate structure on first entry
      const sample = parsed[0];
      const missingKeys = CHANGE_COLUMNS.filter((k) => !(k in sample));
      if (missingKeys.length > 0) {
        throw new Error(
          `Formato inválido. Chaves ausentes: ${missingKeys.join(", ")}`,
        );
      }

      setRestoreData(parsed);

      // Count unique PKs per table for the summary
      const pkSets: Record<string, Set<string>> = {};
      for (const row of parsed) {
        const tbl = row.table as string;
        if (!pkSets[tbl]) pkSets[tbl] = new Set();
        pkSets[tbl].add(String(row.pk));
      }

      const summary: Record<string, number> = {};
      for (const [tbl, pks] of Object.entries(pkSets)) {
        summary[tbl] = pks.size;
      }
      setRestoreSummary(summary);

      // Proceed to schema check
      await runSchemaCheck();
    } catch (err: any) {
      setRestoreError(err.message || "Falha ao processar o arquivo.");
      setStep("error");
    }
  }

  // ── Schema validation ────────────────────────────────────
  async function runSchemaCheck() {
    setStep("schema-check");

    try {
      const report: SchemaTableInfo[] = [];
      let allValid = true;

      for (const tableName of EXPECTED_TABLES) {
        const info = await db.execA(`PRAGMA table_info('${tableName}')`);
        const found = info.length > 0;
        if (!found) allValid = false;
        report.push({ name: tableName, found, columnCount: info.length });
      }

      setSchemaReport(report);
      setSchemaValid(allValid);
    } catch (err: any) {
      setRestoreError(err.message || "Falha na verificação do esquema.");
      setStep("error");
    }
  }

  // ── Check existing data ──────────────────────────────────
  async function checkExistingData() {
    const counts: Record<string, number> = {};
    let hasData = false;

    for (const tableName of EXPECTED_TABLES) {
      try {
        const [[count]] = await db.execA(
          `SELECT COUNT(*) FROM "${tableName}"`,
        );
        counts[tableName] = Number(count);
        if (Number(count) > 0) hasData = true;
      } catch {
        counts[tableName] = 0;
      }
    }

    setExistingCounts(counts);
    setStep(hasData ? "conflict" : "summary");
  }

  // ── Select a network backup ──────────────────────────────
  async function handleSelectNetworkBackup(backup: NetworkBackup) {
    setSelectedSource(backup.name);
    try {
      const content = await readTextFile(backup.path);
      await processBackupData(content);
    } catch (err: any) {
      setRestoreError(`Falha ao ler: ${err.message || "Erro desconhecido"}`);
      setStep("error");
    }
  }

  // ── Select a local file ──────────────────────────────────
  function handleLocalFile(file: File) {
    if (!file.name.endsWith(".json")) {
      toast({
        variant: "destructive",
        title: "Formato inválido",
        description: "Selecione um arquivo .json de backup.",
      });
      return;
    }

    setSelectedSource(file.name);

    const reader = new FileReader();
    reader.onload = async (e) => {
      const content = e.target?.result as string;
      await processBackupData(content);
    };
    reader.onerror = () => {
      setRestoreError("Falha ao ler o arquivo local.");
      setStep("error");
    };
    reader.readAsText(file);
  }

  // ── Core restore ─────────────────────────────────────────
  async function handleRestoreConfirm() {
    setStep("applying");
    setRestoreProgress({ current: 0, total: restoreData.length });

    let errorCount = 0;

    try {
      // Tombstone-free clear: bypass CRR tracking during deletion
      // so the backup's older versions aren't rejected by tombstones.
      if (clearBeforeRestore) {
        for (const tableName of CLEARABLE_TABLES) {
          await db.exec(`SELECT crsql_begin_alter('${tableName}')`);
          await db.exec(`DELETE FROM "${tableName}"`);
          await db.exec(`SELECT crsql_commit_alter('${tableName}')`);
          await db.exec(`SELECT crsql_as_crr('${tableName}')`);
        }
      }

      // Convert object rows → positional arrays
      const rows = restoreData.map(convertChangeRow);

      const stmt = await db.prepare(
        `INSERT INTO crsql_changes VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );

      try {
        for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
          const chunk = rows.slice(i, i + CHUNK_SIZE);

          await db.tx(async (tx) => {
            for (const row of chunk) {
              try {
                await stmt.run(tx, ...row);
              } catch (err) {
                console.error("[Restore] Row error:", err);
                errorCount++;
              }
            }
          });

          setRestoreProgress({
            current: Math.min(i + CHUNK_SIZE, rows.length),
            total: rows.length,
          });

          // Yield for UI responsiveness
          await new Promise((r) => setTimeout(r, 0));
        }
      } finally {
        stmt.finalize(null);
      }

      await logAction(orm, {
        action: `RESTAURAÇÃO: ${rows.length - errorCount}/${rows.length} alterações de "${selectedSource}"${clearBeforeRestore ? " (base limpa)" : " (merge)"}`,
        module: "Configurações",
        status: errorCount > 0 ? "Warning" : "Success",
        device: connectedPeers.find((p) => p.id === myId)?.ip || undefined,
      });

      setStep("done");

      if (errorCount > 0) {
        toast({
          variant: "warning",
          title: "Restauração parcial",
          description: `${rows.length - errorCount} aplicadas, ${errorCount} falhas.`,
        });
      } else {
        toast({
          title: "Backup restaurado",
          description: `${rows.length} alterações aplicadas com sucesso.`,
        });
      }

      setTimeout(() => onOpenChange(false), 1500);
    } catch (err: any) {
      console.error("[Restore] Fatal:", err);
      setRestoreError(err.message || "Falha ao aplicar o backup.");
      setStep("error");
    }
  }

  // ── Derived ──────────────────────────────────────────────
  const totalExisting = Object.values(existingCounts).reduce(
    (a, b) => a + b,
    0,
  );
  const totalBackup = Object.values(restoreSummary).reduce(
    (a, b) => a + b,
    0,
  );
  const progressPct =
    restoreProgress.total > 0
      ? Math.round((restoreProgress.current / restoreProgress.total) * 100)
      : 0;

  // ── Render ───────────────────────────────────────────────
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (step !== "applying") {
          onOpenChange(v);
          if (!v) reset();
        }
      }}
    >
      <DialogContent
        className="max-w-lg max-h-[85vh] grid grid-rows-[auto_1fr_auto] p-0 overflow-hidden"
        data-testid="dialog-restore-backup"
      >
        <DialogHeader className="p-6 pb-3">
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-emerald-500" />
            Restaurar Backup
          </DialogTitle>
          <DialogDescription>
            {step === "browse" && "Selecione um backup para restaurar."}
            {step === "loading" && "Lendo arquivo de backup..."}
            {step === "schema-check" && "Verificando integridade do banco..."}
            {step === "conflict" && "Dados existentes detectados."}
            {step === "summary" && "Confirme a restauração."}
            {step === "applying" && "Aplicando alterações..."}
            {step === "done" && "Restauração concluída!"}
            {step === "error" && "Ocorreu um erro."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col min-h-0 overflow-hidden px-6 pb-2">
          {/* ─── BROWSE ─── */}
          {step === "browse" && (
            <div className="space-y-4">
              {isLoadingBackups ? (
                <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
                  <Spinner className="h-4 w-4" />
                  <span className="text-sm">Buscando backups na rede...</span>
                </div>
              ) : networkBackups.length > 0 ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    <Folder className="h-3.5 w-3.5" />
                    Backups na Rede ({networkBackups.length})
                  </div>
                  <ScrollArea className="max-h-[220px] border rounded-lg">
                    <div className="p-1.5 space-y-1">
                      {networkBackups.map((b) => (
                        <button
                          key={b.path}
                          type="button"
                          onClick={() => handleSelectNetworkBackup(b)}
                          className="w-full flex items-center gap-3 p-3 rounded-md text-left hover:bg-muted/60 transition-colors group"
                          data-testid={`backup-option-${b.name}`}
                        >
                          <div className="h-9 w-9 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0 group-hover:bg-emerald-500/20 transition-colors">
                            <FileText className="h-4 w-4 text-emerald-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {b.name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatBackupDate(b.name)}
                            </p>
                          </div>
                          <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        </button>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              ) : (
                !isLoadingBackups && (
                  <div className="text-center py-6 text-sm text-muted-foreground">
                    <Folder className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    Nenhum backup encontrado na rede.
                  </div>
                )
              )}

              {/* Divider */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t" />
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-background px-3 text-xs text-muted-foreground">
                    ou
                  </span>
                </div>
              </div>

              {/* Local file */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full border-2 border-dashed rounded-xl p-6 flex flex-col items-center gap-2 hover:border-emerald-500/40 hover:bg-emerald-500/5 transition-all cursor-pointer group"
                data-testid="button-select-local-backup"
              >
                <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center group-hover:bg-emerald-500/10 transition-colors">
                  <Upload className="h-5 w-5 text-muted-foreground group-hover:text-emerald-600 transition-colors" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium">
                    Selecionar arquivo local
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Arquivo .json de backup
                  </p>
                </div>
              </button>
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept=".json"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleLocalFile(f);
                }}
              />
            </div>
          )}

          {/* ─── LOADING ─── */}
          {step === "loading" && (
            <div className="flex flex-col items-center justify-center gap-3 py-12">
              <Spinner className="h-8 w-8 text-emerald-500" />
              <p className="text-sm text-muted-foreground">
                Processando{" "}
                <span className="font-medium text-foreground">
                  {selectedSource}
                </span>
                ...
              </p>
            </div>
          )}

          {/* ─── SCHEMA CHECK ─── */}
          {step === "schema-check" && schemaReport.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <Database className="h-3.5 w-3.5" />
                Verificação do Esquema
              </div>

              <div className="border rounded-lg divide-y">
                {schemaReport.map((t) => (
                  <div
                    key={t.name}
                    className="flex items-center justify-between px-4 py-2.5"
                  >
                    <div className="flex items-center gap-2">
                      {t.found ? (
                        <Check className="h-4 w-4 text-emerald-500" />
                      ) : (
                        <X className="h-4 w-4 text-destructive" />
                      )}
                      <span className="text-sm font-medium">
                        {TABLE_LABELS[t.name] || t.name}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground font-mono">
                      {t.found ? `${t.columnCount} col` : "ausente"}
                    </span>
                  </div>
                ))}
              </div>

              {schemaValid ? (
                <div className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-sm p-3 rounded-lg flex gap-2 items-center">
                  <Check className="h-4 w-4 shrink-0" />
                  Esquema válido. Todas as tabelas encontradas.
                </div>
              ) : (
                <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg flex gap-2 items-start">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>
                    Tabelas ausentes. Execute as migrações antes de restaurar.
                  </span>
                </div>
              )}
            </div>
          )}

          {/* ─── CONFLICT ─── */}
          {step === "conflict" && (
            <div className="space-y-4">
              <div className="bg-amber-500/10 text-amber-700 dark:text-amber-400 text-sm p-3 rounded-lg flex gap-2 items-start">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>
                  O banco contém{" "}
                  <strong>{totalExisting} registros</strong>. Escolha como
                  proceder:
                </span>
              </div>

              <div className="border rounded-lg divide-y">
                {EXPECTED_TABLES.filter((t) => (existingCounts[t] ?? 0) > 0).map(
                  (t) => (
                    <div
                      key={t}
                      className="flex items-center justify-between px-4 py-2"
                    >
                      <span className="text-sm">
                        {TABLE_LABELS[t] || t}
                      </span>
                      <span className="text-sm font-mono font-medium">
                        {existingCounts[t]}
                      </span>
                    </div>
                  ),
                )}
              </div>

              <div className="grid gap-2">
                <Button
                  variant="outline"
                  className="w-full gap-2 border-emerald-500/20 bg-emerald-500/5 text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-700 justify-start"
                  onClick={() => {
                    setClearBeforeRestore(false);
                    setStep("summary");
                  }}
                  data-testid="button-merge-data"
                >
                  <Check className="h-4 w-4" />
                  <div className="text-left">
                    <div className="font-medium">Manter e Mesclar</div>
                    <div className="text-[10px] text-muted-foreground font-normal">
                      Dados atuais permanecem, backup é mesclado via CRDT
                    </div>
                  </div>
                </Button>
                <Button
                  variant="outline"
                  className="w-full gap-2 border-destructive/20 bg-destructive/5 text-destructive hover:bg-destructive/10 justify-start"
                  onClick={() => {
                    setClearBeforeRestore(true);
                    setStep("summary");
                  }}
                  data-testid="button-clear-then-restore"
                >
                  <Trash2 className="h-4 w-4" />
                  <div className="text-left">
                    <div className="font-medium">Limpar antes de Restaurar</div>
                    <div className="text-[10px] text-muted-foreground font-normal">
                      Remove dados atuais e aplica o backup do zero
                    </div>
                  </div>
                </Button>
              </div>
            </div>
          )}

          {/* ─── SUMMARY ─── */}
          {step === "summary" && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <Database className="h-3.5 w-3.5" />
                Resumo do Backup
              </div>

              <div className="border rounded-lg overflow-hidden">
                <div className="grid grid-cols-3 gap-0 bg-muted/30 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b">
                  <span>Tabela</span>
                  <span className="text-center">No Backup</span>
                  <span className="text-right">Atual</span>
                </div>
                <div className="divide-y">
                  {EXPECTED_TABLES.map((t) => (
                    <div
                      key={t}
                      className="grid grid-cols-3 gap-0 px-4 py-2.5 text-sm"
                    >
                      <span className="font-medium">
                        {TABLE_LABELS[t] || t}
                      </span>
                      <span className="text-center font-mono">
                        {restoreSummary[t] || "—"}
                      </span>
                      <span className="text-right font-mono text-muted-foreground">
                        {existingCounts[t] || "—"}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-0 bg-muted/20 px-4 py-2 text-sm font-bold border-t">
                  <span>Total</span>
                  <span className="text-center font-mono">{totalBackup}</span>
                  <span className="text-right font-mono text-muted-foreground">
                    {totalExisting}
                  </span>
                </div>
              </div>

              <div className="text-xs text-muted-foreground text-center italic">
                {restoreData.length} entradas crsql_changes serão aplicadas
                {clearBeforeRestore && " após limpar os dados atuais"}.
              </div>

              {clearBeforeRestore && (
                <div className="bg-destructive/10 text-destructive text-xs p-2.5 rounded-lg flex gap-2 items-center">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  Clientes, serviços, pagamentos, tags e vínculos serão removidos
                  antes da restauração.
                </div>
              )}
            </div>
          )}

          {/* ─── APPLYING ─── */}
          {step === "applying" && (
            <div className="flex flex-col items-center justify-center gap-4 py-8">
              <Spinner className="h-8 w-8 text-emerald-500" />
              <div className="w-full max-w-xs space-y-2">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Aplicando alterações...</span>
                  <span>{progressPct}%</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <p className="text-center text-xs text-muted-foreground font-mono">
                  {restoreProgress.current.toLocaleString()} /{" "}
                  {restoreProgress.total.toLocaleString()}
                </p>
              </div>
            </div>
          )}

          {/* ─── DONE ─── */}
          {step === "done" && (
            <div className="flex flex-col items-center justify-center gap-3 py-12">
              <div className="h-14 w-14 rounded-full bg-emerald-500/10 flex items-center justify-center animate-in fade-in zoom-in duration-300">
                <Check className="h-7 w-7 text-emerald-500" />
              </div>
              <p className="text-sm font-medium">Restauração concluída!</p>
              <p className="text-xs text-muted-foreground">
                {restoreData.length} alterações aplicadas.
              </p>
            </div>
          )}

          {/* ─── ERROR ─── */}
          {step === "error" && (
            <div className="flex flex-col items-center justify-center gap-3 py-8">
              <div className="h-14 w-14 rounded-full bg-destructive/10 flex items-center justify-center">
                <X className="h-7 w-7 text-destructive" />
              </div>
              <p className="text-sm font-medium text-destructive">
                Erro na Restauração
              </p>
              <p className="text-xs text-muted-foreground text-center max-w-sm">
                {restoreError}
              </p>
            </div>
          )}
        </div>

        {/* ─── FOOTER ─── */}
        <DialogFooter className="p-6 pt-3 border-t bg-muted/10">
          {step === "browse" && (
            <Button
              variant="secondary"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
          )}

          {step === "schema-check" && (
            <>
              <Button variant="secondary" onClick={reset}>
                Voltar
              </Button>
              {schemaValid && (
                <Button
                  onClick={checkExistingData}
                  className="gap-2 bg-emerald-600 hover:bg-emerald-700"
                  data-testid="button-schema-continue"
                >
                  <ChevronRight className="h-4 w-4" />
                  Continuar
                </Button>
              )}
            </>
          )}

          {step === "conflict" && (
            <Button variant="secondary" onClick={reset}>
              Voltar
            </Button>
          )}

          {step === "summary" && (
            <>
              <Button variant="secondary" onClick={reset}>
                Voltar
              </Button>
              <Button
                onClick={handleRestoreConfirm}
                className="gap-2 bg-emerald-600 hover:bg-emerald-700"
                data-testid="button-confirm-restore"
              >
                <RotateCcw className="h-4 w-4" />
                Restaurar Agora
              </Button>
            </>
          )}

          {step === "error" && (
            <>
              <Button
                variant="secondary"
                onClick={() => onOpenChange(false)}
              >
                Fechar
              </Button>
              <Button variant="outline" onClick={reset}>
                Tentar Novamente
              </Button>
            </>
          )}

          {step === "done" && (
            <Button onClick={() => onOpenChange(false)}>Fechar</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
