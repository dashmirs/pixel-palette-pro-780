import { useCallback, useEffect, useMemo, useState } from "react";
import { Upload, FileText, Image as ImageIcon, Table2, Download, Loader2, X, CheckCircle2, AlertCircle, Maximize2, Lock, Unlock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  buildOutputName,
  convertFile,
  detectCategory,
  downloadAllAsZip,
  downloadBlob,
  getAvailableFormats,
  getPreferredFormats,
  type ConversionCategory,
  type ImageResizeOptions,
} from "@/lib/converters";

type Status = "pending" | "converting" | "done" | "error";

interface QueueItem {
  id: string;
  file: File;
  category: ConversionCategory;
  target: string;
  status: Status;
  result?: Blob;
  error?: string;
  origWidth?: number;
  origHeight?: number;
  resizeEnabled?: boolean;
  resizeWidth?: number;
  resizeHeight?: number;
  keepAspect?: boolean;
}

function categoryIcon(c: ConversionCategory) {
  if (c === "image") return <ImageIcon className="h-4 w-4" />;
  if (c === "spreadsheet") return <Table2 className="h-4 w-4" />;
  return <FileText className="h-4 w-4" />;
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileConverter() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);

  const addFiles = useCallback((files: FileList | File[]) => {
    const next: QueueItem[] = [];
    for (const file of Array.from(files)) {
      const category = detectCategory(file);
      if (!category) continue;
      const formats = getPreferredFormats(category, file.name);
      next.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        category,
        target: formats.find((format) => !file.name.toLowerCase().endsWith(`.${format === "jpeg" ? "jpg" : format}`)) ?? formats[0],
        status: "pending",
        keepAspect: true,
        resizeEnabled: false,
      });
    }
    setItems((prev) => [...prev, ...next]);
  }, []);

  useEffect(() => {
    items.forEach((item) => {
      if (item.category === "image" && item.origWidth == null) {
        const url = URL.createObjectURL(item.file);
        const img = new Image();
        img.onload = () => {
          setItems((prev) =>
            prev.map((i) =>
              i.id === item.id
                ? {
                    ...i,
                    origWidth: img.naturalWidth,
                    origHeight: img.naturalHeight,
                    resizeWidth: img.naturalWidth,
                    resizeHeight: img.naturalHeight,
                  }
                : i,
            ),
          );
          URL.revokeObjectURL(url);
        };
        img.onerror = () => URL.revokeObjectURL(url);
        img.src = url;
      }
    });
  }, [items]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files) addFiles(e.dataTransfer.files);
  };

  const updateTarget = (id: string, target: string) =>
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, target } : i)));

  const updateItem = (id: string, patch: Partial<QueueItem>) =>
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));

  const onResizeWidth = (item: QueueItem, value: number) => {
    if (!value || value < 1) return updateItem(item.id, { resizeWidth: value });
    if (item.keepAspect && item.origWidth && item.origHeight) {
      const h = Math.round((value / item.origWidth) * item.origHeight);
      updateItem(item.id, { resizeWidth: value, resizeHeight: h });
    } else {
      updateItem(item.id, { resizeWidth: value });
    }
  };
  const onResizeHeight = (item: QueueItem, value: number) => {
    if (!value || value < 1) return updateItem(item.id, { resizeHeight: value });
    if (item.keepAspect && item.origWidth && item.origHeight) {
      const w = Math.round((value / item.origHeight) * item.origWidth);
      updateItem(item.id, { resizeHeight: value, resizeWidth: w });
    } else {
      updateItem(item.id, { resizeHeight: value });
    }
  };

  const buildResizeOpts = (item: QueueItem): ImageResizeOptions | undefined => {
    if (item.category !== "image" || !item.resizeEnabled) return undefined;
    return {
      width: item.resizeWidth,
      height: item.resizeHeight,
      keepAspectRatio: item.keepAspect,
    };
  };

  const removeItem = (id: string) =>
    setItems((prev) => prev.filter((i) => i.id !== id));

  const convertOne = async (item: QueueItem) => {
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: "converting" } : i)));
    try {
      const blob = await convertFile(item.file, item.category, item.target, {
        resize: buildResizeOpts(item),
      });
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: "done", result: blob } : i)));
      return blob;
    } catch (err: any) {
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, status: "error", error: err?.message ?? "Failed" } : i))
      );
      return null;
    }
  };

  const convertAll = async () => {
    setBusy(true);
    for (const item of items) {
      if (item.status === "done") continue;
      await convertOne(item);
    }
    setBusy(false);
  };

  const downloadOne = async (item: QueueItem) => {
    let blob = item.result;
    if (!blob) blob = (await convertOne(item)) ?? undefined;
    if (!blob) return;
    downloadBlob(blob, buildOutputName(item.file.name, item.target));
  };

  const downloadAll = async () => {
    setBusy(true);
    const ready: { blob: Blob; name: string }[] = [];
    for (const item of items) {
      let blob = item.result;
      if (!blob) blob = (await convertOne(item)) ?? undefined;
      if (blob) ready.push({ blob, name: buildOutputName(item.file.name, item.target) });
    }
    if (ready.length) await downloadAllAsZip(ready);
    setBusy(false);
  };

  const counts = useMemo(() => {
    return {
      total: items.length,
      done: items.filter((i) => i.status === "done").length,
    };
  }, [items]);

  return (
    <div className="space-y-6">
      <Card
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`relative overflow-hidden border-2 border-dashed p-10 text-center transition-all ${
          dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
        }`}
      >
        <div className="mx-auto flex max-w-lg flex-col items-center gap-4">
          <div
            className="flex h-16 w-16 items-center justify-center rounded-2xl text-primary-foreground"
            style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-glow)" }}
          >
            <Upload className="h-7 w-7" />
          </div>
          <div>
            <h3 className="text-xl font-semibold">Drop files here</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Images, documents (PDF, DOCX, TXT, MD, HTML), spreadsheets (XLSX, CSV)
            </p>
          </div>
          <label>
            <input
              type="file"
              multiple
              className="hidden"
              onChange={(e) => e.target.files && addFiles(e.target.files)}
            />
            <Button asChild size="lg">
              <span>Choose files</span>
            </Button>
          </label>
        </div>
      </Card>

      {items.length > 0 && (
        <Card className="p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold">Files</h3>
              <Badge variant="secondary">
                {counts.done}/{counts.total}
              </Badge>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setItems([])} disabled={busy}>
                Clear
              </Button>
              <Button onClick={convertAll} disabled={busy || items.length === 0}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Convert all
              </Button>
              <Button onClick={downloadAll} disabled={busy || items.length === 0} variant="default">
                <Download className="mr-2 h-4 w-4" />
                Download all (ZIP)
              </Button>
            </div>
          </div>

          <div className="divide-y">
            {items.map((item) => (
              <div key={item.id} className="py-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      {categoryIcon(item.category)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{item.file.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatBytes(item.file.size)} · {item.category}
                        {item.category === "image" && item.origWidth && item.origHeight && (
                          <> · {item.origWidth}×{item.origHeight}px</>
                        )}
                      </div>
                    </div>
                  </div>

                  {item.category === "image" && (
                    <Button
                      size="sm"
                      variant={item.resizeEnabled ? "default" : "outline"}
                      onClick={() => updateItem(item.id, { resizeEnabled: !item.resizeEnabled })}
                    >
                      <Maximize2 className="mr-1 h-3.5 w-3.5" />
                      Resize
                    </Button>
                  )}

                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">to</span>
                    <Select value={item.target} onValueChange={(v) => updateTarget(item.id, v)}>
                      <SelectTrigger className="w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {getPreferredFormats(item.category, item.file.name).map((f) => (
                          <SelectItem key={f} value={f}>
                            {f.toUpperCase()}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center gap-2">
                    {item.status === "converting" && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                    {item.status === "done" && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                    {item.status === "error" && (
                      <span title={item.error}>
                        <AlertCircle className="h-4 w-4 text-destructive" />
                      </span>
                    )}
                    <Button size="sm" onClick={() => downloadOne(item)} disabled={item.status === "converting"}>
                      <Download className="mr-1 h-3.5 w-3.5" />
                      Download
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => removeItem(item.id)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {item.category === "image" && item.resizeEnabled && (
                  <div className="mt-3 flex flex-wrap items-end gap-3 rounded-lg border border-border bg-muted/30 p-3">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-muted-foreground">Width (px)</label>
                      <Input
                        type="number"
                        min={1}
                        className="h-9 w-28"
                        value={item.resizeWidth ?? ""}
                        onChange={(e) => onResizeWidth(item, parseInt(e.target.value, 10))}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-muted-foreground">Height (px)</label>
                      <Input
                        type="number"
                        min={1}
                        className="h-9 w-28"
                        value={item.resizeHeight ?? ""}
                        onChange={(e) => onResizeHeight(item, parseInt(e.target.value, 10))}
                      />
                    </div>
                    <Button
                      size="sm"
                      variant={item.keepAspect ? "default" : "outline"}
                      onClick={() => updateItem(item.id, { keepAspect: !item.keepAspect })}
                    >
                      {item.keepAspect ? <Lock className="mr-1 h-3.5 w-3.5" /> : <Unlock className="mr-1 h-3.5 w-3.5" />}
                      {item.keepAspect ? "Locked" : "Free"}
                    </Button>
                    <div className="flex flex-wrap gap-1">
                      {[25, 50, 75].map((p) => (
                        <Button
                          key={p}
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            if (!item.origWidth || !item.origHeight) return;
                            updateItem(item.id, {
                              resizeWidth: Math.round((item.origWidth * p) / 100),
                              resizeHeight: Math.round((item.origHeight * p) / 100),
                            });
                          }}
                        >
                          {p}%
                        </Button>
                      ))}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          updateItem(item.id, {
                            resizeWidth: item.origWidth,
                            resizeHeight: item.origHeight,
                          })
                        }
                      >
                        Reset
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}