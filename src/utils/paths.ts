import { homedir } from "node:os";
import { existsSync } from "node:fs";
import { join, resolve, isAbsolute } from "node:path";

interface AliasEntry {
  names: string[];
  knownPaths: string[];
  cached: string | null;
}

class PathResolverImpl {
  private home: string;
  private aliases: Map<string, AliasEntry> = new Map();

  constructor() {
    this.home = homedir();
    this.init();
  }

  private init() {
    const knownFolders = [
      { names: ["desktop", "area de trabalho", "mesa"], rel: "Desktop" },
      { names: ["documents", "documentos", "docs", "meus documentos"], rel: "Documents" },
      { names: ["downloads", "download", "down"], rel: "Downloads" },
      { names: ["music", "musica", "música"], rel: "Music" },
      { names: ["pictures", "imagens", "fotos"], rel: "Pictures" },
      { names: ["videos", "vídeos"], rel: "Videos" },
      { names: ["appdata", "dados de aplicativos"], rel: "AppData/Roaming" },
      { names: ["home", "usuário", "user"], rel: "" },
      { names: ["onedrive"], rel: "OneDrive" },
    ];

    const localeMap: Record<string, string> = {
      Desktop: "Área de Trabalho",
      Documents: "Documentos",
      Downloads: "Downloads",
      Music: "Música",
      Pictures: "Imagens",
      Videos: "Vídeos",
    };

    for (const folder of knownFolders) {
      const candidates: string[] = [];
      const rel = folder.rel;

      if (rel) {
        candidates.push(join(this.home, rel));
        const oneDrive = join(this.home, "OneDrive", rel);
        if (isOneDriveCandidate(rel)) {
          candidates.push(oneDrive);
          const localized = localeMap[rel];
          if (localized) {
            candidates.push(join(this.home, "OneDrive", localized));
          }
        }
        const localeName = localeMap[rel];
        if (localeName) {
          candidates.push(join(this.home, localeName));
        }
      }

      const entry: AliasEntry = {
        names: folder.names,
        knownPaths: candidates,
        cached: null,
      };

      for (const name of folder.names) {
        this.aliases.set(name, entry);
      }
    }
  }

  resolve(raw: string): string {
    if (!raw || !raw.trim()) return raw;
    const input = raw.trim();

    if (isAbsolute(input)) return input;

    const shortcutMatch = input.match(/^~(\w[\w\s]*)?(.*)/);
    if (shortcutMatch) {
      const aliasName = (shortcutMatch[1] || "home").trim().toLowerCase();
      const suffix = shortcutMatch[2] || "";
      const resolved = this.resolveAlias(aliasName);
      if (resolved) {
        return join(resolved, suffix.replace(/^[\\/]+/, "")).replace(/[/\\]+$/, "");
      }
    }

    if (input.startsWith("~/") || input === "~") {
      return join(this.home, input.slice(2).replace(/^[\\/]+/, ""));
    }

    const lower = input.toLowerCase();
    for (const [name, entry] of this.aliases) {
      if (lower.startsWith(name)) {
        const suffix = input.slice(name.length).replace(/^[\\/\s]+/, "");
        const resolved = this.resolveAlias(name);
        if (resolved) {
          return suffix ? join(resolved, suffix) : resolved;
        }
      }
    }

    const homeJoined = join(this.home, input);
    if (existsSync(homeJoined)) return homeJoined;

    return input;
  }

  resolveMany(...paths: string[]): string[] {
    return paths.map((p) => this.resolve(p));
  }

  private resolveAlias(name: string): string | null {
    const entry = this.aliases.get(name);
    if (!entry) return null;

    if (entry.cached && existsSync(entry.cached)) {
      return entry.cached;
    }

    for (const p of entry.knownPaths) {
      if (existsSync(p)) {
        entry.cached = p;
        return p;
      }
    }

    return entry.knownPaths[0] || null;
  }

  getShortcutsHelp(): string {
    const seen = new Set<string>();
    const lines: string[] = [
      "=== ATALHOS DE CAMINHOS ===",
      "Use atalhos no lugar de caminhos absolutos para acessar pastas comuns:",
    ];
    for (const [, entry] of this.aliases) {
      const key = entry.names.join(",");
      if (seen.has(key)) continue;
      seen.add(key);
      const primary = entry.knownPaths[0] && entry.knownPaths[0].replace(this.home, "~");
      const examples = entry.names.slice(0, 3).map((n) => `~${n}`).join(", ");
      if (examples) {
        lines.push(`  • ${examples} → ${primary || "pasta do usuário"}`);
      }
    }
    lines.push("");
    lines.push("Exemplos de uso:");
    lines.push('  ~desktop/minha-pasta');
    lines.push('  ~docs/relatorios');
    lines.push('  ~downloads');
    lines.push('  downloads (busca automática no home)');
    return lines.join("\n");
  }
}

function isOneDriveCandidate(rel: string): boolean {
  const desktopRelated = ["Desktop", "Documents", "Pictures", "Downloads", "Music", "Videos"];
  return desktopRelated.includes(rel);
}

export const pathResolver = new PathResolverImpl();
export const resolvePath = (p: string) => pathResolver.resolve(p);
export const getPathShortcutsHelp = () => pathResolver.getShortcutsHelp();
