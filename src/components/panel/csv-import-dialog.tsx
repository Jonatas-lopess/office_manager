import { useState, useRef, useMemo } from "react";
import Papa from "papaparse";
import { v7 as uuidv7 } from "uuid";
import { parse, isValid, format } from "date-fns";
import { insertClientSchema } from "@/db/validations";
import {
  Upload,
  FileText,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Database,
  Check,
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { myId, connectedPeers } = useSync();

  const reset = () => {
    setStep("upload");
    setFile(null);
    setCsvData([]);
    setMappings([]);
    setIsProcessing(false);
  };

  const handleFile = (selectedFile: File) => {
    if (!selectedFile.name.endsWith(".csv")) return;
    setFile(selectedFile);

    Papa.parse(selectedFile, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const detectedHeaders = results.meta.fields || [];
        setCsvData(results.data);

        // Smart Mapping Logic
        const initialMappings: FieldMapping[] = detectedHeaders.map(
          (header) => {
            const lowerHeader = header.toLowerCase().trim();

            // Fuzzy match logic
            let dbField = "";
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
            else if (lowerHeader.includes("email") || lowerHeader === "e-mail")
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

  const normalizeDate = (value: string) => {
    if (!value) return "";
    const clean = value.trim();
    if (!clean) return "";

    // If already YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;

    // Try DD/MM/YYYY
    const parsedDMY = parse(clean, "dd/MM/yyyy", new Date());
    if (isValid(parsedDMY)) return format(parsedDMY, "yyyy-MM-dd");

    // Try DD-MM-YYYY
    const parsedDMYDash = parse(clean, "dd-MM-yyyy", new Date());
    if (isValid(parsedDMYDash)) return format(parsedDMYDash, "yyyy-MM-dd");

    return clean; // Fallback to original string if not recognized
  };

  const handleConfirm = async () => {
    setIsProcessing(true);

    const nowIso = new Date().toISOString();
    let successCount = 0;
    let errorCount = 0;

    const clientsToInsert: any[] = [];

    csvData.forEach((row) => {
      const data: any = {};

      mappings.forEach((m) => {
        if (m.enabled && m.dbField) {
          let val = row[m.csvHeader] || "";

          // Date normalization
          if (m.dbField === "birth_date" || m.dbField === "cnpj_begin_date") {
            val = normalizeDate(val);
          }

          data[m.dbField] = val;
        }
      });

      // Run local validation
      try {
        const validated = insertClientSchema.parse(data);
        clientsToInsert.push({
          ...validated,
          id: uuidv7(),
          status: "Active",
          created_at: nowIso,
          updated_at: nowIso,
        });
        successCount++;
      } catch (err) {
        console.error("Validation failed for row:", row, err);
        errorCount++;
      }
    });

    try {
      if (clientsToInsert.length > 0) {
        await orm.insert(clientsTable).values(clientsToInsert);

        // Register log using helper
        await logAction(orm, {
          action: `Importação de ${successCount} clientes via CSV. ${file?.name && "Arquivo: " + file?.name}`,
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
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle className="flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            Importar Clientes (CSV)
          </DialogTitle>
          <DialogDescription>
            {step === "upload" && "Selecione um arquivo CSV para começar."}
            {step === "map" &&
              "Relacione as colunas do seu arquivo com os campos do sistema."}
            {step === "confirm" &&
              "Confirme os dados antes de salvar no banco de dados."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden p-6 pt-2">
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
            <div className="space-y-4 flex flex-col h-full overflow-hidden">
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

              <ScrollArea className="flex-1 border rounded-lg bg-card">
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
                  Salvando {csvData.length} clientes...
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
