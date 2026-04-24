import { createFileRoute } from "@tanstack/react-router";
import { FileConverter } from "@/components/converter/FileConverter";
import { AdBanner } from "@/components/AdBanner";
import { Sparkles, Zap, ShieldCheck, FileText, Image as ImageIcon, Table2 } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ConvertHub — Convert Files & Images Online, Free & Private" },
      {
        name: "description",
        content:
          "Convert documents (PDF, DOCX, TXT, HTML), spreadsheets (XLSX, CSV, JSON) and images (PNG, JPG, WEBP, BMP) right in your browser. Fast, free, no upload to any server.",
      },
      { property: "og:title", content: "ConvertHub — Convert Files & Images Online" },
      {
        property: "og:description",
        content: "Free in-browser file & image converter. PDF, DOCX, XLSX, CSV, PNG, JPG, WEBP and more.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border/50 bg-background/80 backdrop-blur-lg">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-lg text-primary-foreground"
              style={{ background: "var(--gradient-primary)" }}
            >
              <Sparkles className="h-5 w-5" />
            </div>
            <span className="text-lg font-bold">ConvertHub</span>
          </div>
          <nav className="hidden gap-6 text-sm text-muted-foreground sm:flex">
            <a href="#converter" className="hover:text-foreground">Converter</a>
            <a href="#features" className="hover:text-foreground">Features</a>
            <a href="#formats" className="hover:text-foreground">Formats</a>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section
        className="relative overflow-hidden"
        style={{ background: "var(--gradient-hero)" }}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,white,transparent_50%)] opacity-20" />
        <div className="relative mx-auto max-w-6xl px-4 py-20 text-center text-primary-foreground">
          <div className="mx-auto mb-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs backdrop-blur">
            <Zap className="h-3.5 w-3.5" />
            100% browser-based · No uploads
          </div>
          <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight sm:text-6xl">
            Convert files & images in seconds
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-white/80">
            Documents, spreadsheets and images — all formats, all in your browser. Private, fast and free.
          </p>
        </div>
      </section>

      {/* Top ad banner */}
      <div className="mx-auto max-w-6xl px-4 pt-8">
        <AdBanner label="Ad space — 728×90" />
      </div>

      {/* Converter */}
      <section id="converter" className="mx-auto max-w-6xl px-4 py-12">
        <FileConverter />
      </section>

      {/* Mid ad banner */}
      <div className="mx-auto max-w-6xl px-4 pb-12">
        <AdBanner label="Ad space — 970×90" height="h-28" />
      </div>

      {/* Features */}
      <section id="features" className="mx-auto max-w-6xl px-4 py-12">
        <div className="mb-10 text-center">
          <h2 className="text-3xl font-bold">Why ConvertHub</h2>
          <p className="mt-2 text-muted-foreground">Everything you need, nothing you don't.</p>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {[
            { icon: ShieldCheck, title: "Private by design", text: "Your files never leave your device. All conversion runs locally." },
            { icon: Zap, title: "Lightning fast", text: "No upload time. Instant conversion powered by your browser." },
            { icon: Sparkles, title: "All-in-one", text: "Documents, spreadsheets and images in a single beautiful tool." },
          ].map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-border bg-card p-6 transition-all hover:-translate-y-1"
              style={{ boxShadow: "var(--shadow-elegant)" }}
            >
              <div
                className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl text-primary-foreground"
                style={{ background: "var(--gradient-primary)" }}
              >
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Formats */}
      <section id="formats" className="mx-auto max-w-6xl px-4 py-12">
        <div className="grid gap-6 md:grid-cols-3">
          {[
            { icon: ImageIcon, title: "Images", formats: ["PNG", "JPG", "WEBP", "BMP"] },
            { icon: FileText, title: "Documents", formats: ["PDF", "DOCX", "TXT", "HTML", "MD"] },
            { icon: Table2, title: "Spreadsheets", formats: ["XLSX", "CSV", "JSON", "HTML"] },
          ].map((c) => (
            <div key={c.title} className="rounded-2xl border border-border bg-card p-6">
              <div className="mb-3 flex items-center gap-2">
                <c.icon className="h-5 w-5 text-primary" />
                <h3 className="font-semibold">{c.title}</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {c.formats.map((f) => (
                  <span key={f} className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                    {f}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Footer ad */}
      <div className="mx-auto max-w-6xl px-4 py-8">
        <AdBanner label="Ad space — footer" />
      </div>

      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} ConvertHub · All conversions happen in your browser
      </footer>
    </div>
  );
}
