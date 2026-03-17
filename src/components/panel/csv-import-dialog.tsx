import { useState, useRef, useMemo } from "react";
import Papa from "papaparse";
import { v7 as uuidv7 } from "uuid";
import { parse, isValid } from "date-fns";
import { Client, insertClientSchema } from "@/db/validations";
import {
  Upload,
  FileText,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Database,
  Check,
  Info,
} from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { useDb } from "@/db/context";
import { clientsTable } from "@/db/schema";
import { logAction } from "@/lib/logger";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useSync } from "@/db/sync-context";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { eq } from "drizzle-orm";
import { ZodError } from "zod";

interface FieldMapping {
  csvHeader: string;
  dbField: string;
  enabled: boolean;
}

const DB_FIELDS = [
  { key: "name", label: "Nome Completo", required: true },
  { key: "cpf", label: "CPF", required: false },
  { key: "cnpj", label: "CNPJ", required: false },
  { key: "cnpj_begin_date", label: "Data de Início do CNPJ", required: false },
  { key: "email", label: "Email", required: false },
  { key: "phone", label: "Telefone", required: false },
  { key: "payment_source", label: "Fonte Pagadora", required: false },
  { key: "gov_password", label: "Senha Gov", required: false },
  { key: "birth_date", label: "Data Nasc.", required: false },
  { key: "observations", label: "Observações", required: false },
];

export function CSVImportDialog({
  open,
  onOpenChange,
  onImportComplete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportComplete: (count: number) => void;
}) {
  const [step, setStep] = useState<"upload" | "map" | "confirm">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [csvData, setCsvData] = useState<any[]>([]);
  const [mappings, setMappings] = useState<FieldMapping[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedCount, setProcessedCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentParseId = useRef(0);
  const { myId, connectedPeers } = useSync();

  const reset = () => {
    setStep("upload");
    setFile(null);
    setCsvData([]);
    setMappings([]);
    setIsProcessing(false);
    setProcessedCount(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    currentParseId.current++; // Invalidate any pending parse
  };

  const handleFile = (selectedFile: File) => {
    if (!selectedFile.name.endsWith(".csv")) return;
    setFile(selectedFile);

    const parseId = ++currentParseId.current;
    const usedHeaders = new Set<string>();
    const renamedHeaders: string[] = [];

    Papa.parse(selectedFile, {
      header: false,
      skipEmptyLines: true,
      worker: true,
      complete: (results) => {
        // Only update if this is still the current active parse
        if (parseId !== currentParseId.current) return;

        if (!results.data || results.data.length === 0) return;

        const rawRows = results.data as string[][];
        const rawHeaders = rawRows[0];
        const dataRows = rawRows.slice(1);

        // Process headers (handle duplicates)
        const processedHeaders: string[] = [];
        rawHeaders.forEach((header) => {
          const originalTrimmed = header?.trim() || "";
          const isPlaceholder = originalTrimmed === "";
          let h = originalTrimmed || "Coluna Sem Nome";
          const baseName = h;
          let count = 1;

          while (usedHeaders.has(h)) {
            h = `${baseName} (${++count})`;
          }

          if (h !== baseName && !isPlaceholder) {
            renamedHeaders.push(`${baseName} -> ${h}`);
          }

          usedHeaders.add(h);
          processedHeaders.push(h);
        });

        // Map data rows to objects
        const formattedData = dataRows.map((row) => {
          const obj: any = {};
          processedHeaders.forEach((header, index) => {
            obj[header] = row[index];
          });
          return obj;
        });

        setCsvData(formattedData);

        if (renamedHeaders.length > 0) {
          toast({
            variant: "warning",
            title: "Cabeçalhos duplicados encontrados",
            description: `Colunas duplicadas foram renomeadas automaticamente: ${renamedHeaders.slice(0, 3).join(", ")}${renamedHeaders.length > 3 ? "..." : ""}`,
          });
        }

        // Smart Mapping Logic
        const initialMappings: FieldMapping[] = processedHeaders.map(
          (header) => {
            const lowerHeader = header.toLowerCase().trim();
            const isPlaceholder = lowerHeader.includes("coluna sem nome");

            // Fuzzy match logic - Skip if it is a placeholder name
            let dbField = "";
            if (!isPlaceholder) {
              if (
                lowerHeader.includes("nome") ||
                lowerHeader === "name" ||
                lowerHeader === "cliente"
              )
                dbField = "name";
              else if (lowerHeader.includes("cpf")) dbField = "cpf";
              else if (
                lowerHeader.includes("cnpj") &&
                !lowerHeader.includes("data")
              )
                dbField = "cnpj";
              else if (
                lowerHeader.includes("cnpj") &&
                lowerHeader.includes("data")
              )
                dbField = "cnpj_begin_date";
              else if (
                lowerHeader.includes("email") ||
                lowerHeader === "e-mail"
              )
                dbField = "email";
              else if (
                lowerHeader.includes("tel") ||
                lowerHeader.includes("cel") ||
                lowerHeader.includes("phone")
              )
                dbField = "phone";
              else if (
                lowerHeader.includes("pagadora") ||
                lowerHeader.includes("fonte")
              )
                dbField = "payment_source";
              else if (
                lowerHeader.includes("gov") ||
                lowerHeader.includes("senha")
              )
                dbField = "gov_password";
              else if (
                lowerHeader.includes("nasc") ||
                lowerHeader.includes("birth") ||
                lowerHeader === "data"
              )
                dbField = "birth_date";
              else if (
                lowerHeader.includes("obs") ||
                lowerHeader.includes("nota")
              )
                dbField = "observations";
            }

            return {
              csvHeader: header,
              dbField,
              enabled: dbField !== "",
            };
          },
        );

        setMappings(initialMappings);
        setStep("map");
      },
    });
  };

  const toggleMapping = (index: number) => {
    const newMappings = [...mappings];
    newMappings[index].enabled = !newMappings[index].enabled;
    setMappings(newMappings);
  };

  const changeDbField = (index: number, dbField: string) => {
    const newMappings = [...mappings];
    newMappings[index].dbField = dbField;
    if (dbField) newMappings[index].enabled = true;
    setMappings(newMappings);
  };

  const isMappingValid = useMemo(() => {
    const nameMapped = mappings.some((m) => m.enabled && m.dbField === "name");
    return nameMapped;
  }, [mappings]);

  const { orm } = useDb();
  const { toast } = useToast();

  const normalizeDate = (value: string | null | undefined): Date | null => {
    if (!value) return null;
    const clean = value.trim();
    if (!clean) return null;

    // Try DD/MM/YYYY
    const parsedDMY = parse(clean, "dd/MM/yyyy", new Date());
    if (isValid(parsedDMY)) return parsedDMY;

    // Try DD-MM-YYYY
    const parsedDMYDash = parse(clean, "dd-MM-yyyy", new Date());
    if (isValid(parsedDMYDash)) return parsedDMYDash;

    // Fallback to native Date (handles YYYY-MM-DD and others)
    const fallback = new Date(clean);
    if (isValid(fallback)) return fallback;

    return null;
  };

  const normalizeCpf = (cpf: string) => {
    if (!cpf) return "";
    const clean = cpf.trim();
    if (!clean) return "";

    if (clean.length < 11) {
      const zeros = 11 - clean.length;
      return clean.concat("0".repeat(zeros));
    }

    return clean;
  };

  const checkExistingClient = async (client: Partial<Client>) => {
    if (client.cpf) {
      const existing = await orm
        .select()
        .from(clientsTable)
        .where(eq(clientsTable.cpf, client.cpf));

      return existing.length > 0;
    }

    if (client.cnpj) {
      const existing = await orm
        .select()
        .from(clientsTable)
        .where(eq(clientsTable.cnpj, client.cnpj));

      return existing.length > 0;
    }
    return false;
  };

  const handleConfirm = async () => {
    setIsProcessing(true);

    const now = new Date();
    let successCount = 0;
    let errorCount = 0;

    const errors: string[] = [];
    const clientsToInsert: any[] = [];

    for (const row of csvData) {
      const data: any = {};

      mappings.forEach((m) => {
        if (m.enabled && m.dbField) {
          let val = row[m.csvHeader] || "";

          // Date normalization
          if (m.dbField === "birth_date" || m.dbField === "cnpj_begin_date") {
            val = normalizeDate(val);
          }

          // CPF normalization
          if (m.dbField === "cpf") {
            val = normalizeCpf(val);
          }

          data[m.dbField] = val;
        }
      });

      // Run local validation
      try {
        const validated = insertClientSchema.parse(data);
        const clientExists = await checkExistingClient(validated);

        if (clientExists) {
          errorCount++;
          errors.push(
            `CPF/CNPJ already exists: ${data.cpf || data.cnpj || "Sem ID"}`,
          );
          continue;
        }

        clientsToInsert.push({
          ...validated,
          id: uuidv7(),
          status: "Active",
          created_at: now,
          updated_at: now,
        });
        successCount++;
      } catch (err: any) {
        if (err instanceof ZodError) {
          errors.push(
            `${err.issues.map((e) => e.message).join(", ")} at row ${JSON.stringify(row)}`,
          );
        } else {
          errors.push(`${err.message} at row ${JSON.stringify(row)}`);
        }
        errorCount++;
      }
    }

    console.error("Validation errors:", errors);

    try {
      if (clientsToInsert.length > 0) {
        const BATCH_SIZE = 250;
        for (let i = 0; i < clientsToInsert.length; i += BATCH_SIZE) {
          const batch = clientsToInsert.slice(i, i + BATCH_SIZE);
          await orm.insert(clientsTable).values(batch);
          setProcessedCount(Math.min(i + BATCH_SIZE, clientsToInsert.length));
        }

        // Register log using helper
        await logAction(orm, {
          action: `Importação de ${successCount} clientes via CSV. ${file?.name ? "Arquivo: " + file.name : ""}`,
          module: "Clientes",
          device:
            connectedPeers.find((p) => p.id === myId)?.ip || "Desconhecido",
          status: "Success",
        });
      }

      if (errorCount > 0) {
        toast({
          variant: "warning",
          title: "Importação concluída com avisos",
          description: `${successCount} clientes importados. ${errorCount} registros ignorados por erro de validação.`,
        });
      } else {
        toast({
          variant: "success",
          title: "Importação concluída",
          description: `${successCount} clientes foram importados com sucesso.`,
        });
      }

      onImportComplete(successCount);
      onOpenChange(false);
      reset();
    } catch (error) {
      console.error("Import failed:", error);
      toast({
        variant: "destructive",
        title: "Erro na importação",
        description:
          "Ocorreu um erro ao salvar os dados. Verifique o arquivo e tente novamente.",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!isProcessing) {
          onOpenChange(v);
          if (!v) reset();
        }
      }}
    >
      <DialogContent className="max-w-2xl max-h-[90vh] grid grid-rows-[auto_1fr_auto] p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle className="flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            Importar Clientes (CSV)
            <Tooltip delayDuration={100}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  tabIndex={-1}
                  className="inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:text-primary hover:bg-muted transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                >
                  <Info className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent
                side="right"
                className="max-w-xs p-4 bg-card text-card-foreground border shadow-xl"
              >
                <div className="space-y-2">
                  <p className="font-bold text-primary">Campos Esperados:</p>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                      Obrigatório
                    </p>
                    <p>• Nome Completo</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                      Opcionais
                    </p>
                    <ul className="grid grid-cols-2 gap-x-4 gap-y-1">
                      <li>• CPF</li>
                      <li>• CNPJ</li>
                      <li>• Início CNPJ</li>
                      <li>• Email</li>
                      <li>• Telefone</li>
                      <li>• Fonte Pagadora</li>
                      <li>• Senha Gov</li>
                      <li>• Data Nasc.</li>
                      <li>• Observações</li>
                    </ul>
                  </div>
                </div>
              </TooltipContent>
            </Tooltip>
          </DialogTitle>
          <DialogDescription>
            {step === "upload" && "Selecione um arquivo CSV para começar."}
            {step === "map" &&
              "Relacione as colunas do seu arquivo com os campos do sistema."}
            {step === "confirm" &&
              "Confirme os dados antes de salvar no banco de dados."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col min-h-0 overflow-hidden p-6 pt-2">
          {step === "upload" && (
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const dropFile = e.dataTransfer.files[0];
                if (dropFile) handleFile(dropFile);
              }}
              className="border-2 border-dashed rounded-xl h-64 flex flex-col items-center justify-center gap-4 hover:border-primary/50 hover:bg-muted/50 transition-all cursor-pointer group"
            >
              <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Upload className="h-7 w-7 text-primary" />
              </div>
              <div className="text-center">
                <p className="font-semibold">Clique ou arraste o arquivo CSV</p>
                <p className="text-sm text-muted-foreground">
                  O arquivo deve conter pelo menos uma coluna com nomes.
                </p>
              </div>
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept=".csv"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
            </div>
          )}

          {step === "map" && (
            <div className="space-y-4 flex flex-col flex-1 min-h-0 overflow-hidden">
              <div className="bg-muted/30 border rounded-lg p-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                  <span className="text-sm font-medium truncate max-w-[200px]">
                    {file?.name}
                  </span>
                  <Badge variant="secondary" className="text-[10px]">
                    {csvData.length} linhas
                  </Badge>
                </div>
                <Button variant="ghost" size="sm" onClick={reset}>
                  Trocar arquivo
                </Button>
              </div>

              <ScrollArea
                className="flex-1 min-h-0 border rounded-lg bg-card"
                type="always"
              >
                <div className="p-4 space-y-3">
                  {mappings.map((m, idx) => (
                    <div
                      key={idx}
                      className={cn(
                        "flex items-center gap-4 p-3 rounded-lg border transition-all",
                        m.enabled
                          ? "bg-background border-primary/20 shadow-sm"
                          : "bg-muted/10 opacity-60",
                      )}
                    >
                      <Button
                        variant="ghost"
                        size="icon"
                        className={cn(
                          "h-8 w-8",
                          m.enabled ? "text-primary" : "text-muted-foreground",
                        )}
                        onClick={() => toggleMapping(idx)}
                      >
                        {m.enabled ? (
                          <CheckCircle2 className="h-5 w-5" />
                        ) : (
                          <div className="h-5 w-5 rounded-full border-2" />
                        )}
                      </Button>

                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider">
                          Coluna no CSV
                        </p>
                        <p className="font-medium truncate">{m.csvHeader}</p>
                      </div>

                      <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />

                      <div className="w-[200px]">
                        <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider mb-1">
                          Campo Destino
                        </p>
                        <select
                          className="w-full bg-transparent border-b focus:border-primary outline-none py-1 text-sm font-medium"
                          value={m.dbField}
                          onChange={(e) => changeDbField(idx, e.target.value)}
                        >
                          <option value="">(Ignorar campo)</option>
                          {DB_FIELDS.map((df) => (
                            <option key={df.key} value={df.key}>
                              {df.label} {df.required ? "*" : ""}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              {!isMappingValid && (
                <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg flex gap-2 items-center">
                  <AlertCircle className="h-4 w-4" />
                  Você deve mapear pelo menos o campo{" "}
                  <strong>Nome Completo</strong> para continuar.
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="p-6 border-t bg-muted/20">
          <Button
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={isProcessing}
          >
            Cancelar
          </Button>
          {step === "map" && (
            <Button
              onClick={handleConfirm}
              disabled={!isMappingValid || isProcessing}
            >
              {isProcessing ? (
                <>
                  <Spinner className="mr-2 h-4 w-4" />
                  Salvando {processedCount} / {csvData.length}...
                </>
              ) : (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Importar Agora
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
