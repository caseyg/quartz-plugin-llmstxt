import path from "node:path";
import fs from "node:fs/promises";
import type {
  QuartzEmitterPlugin,
  ProcessedContent,
  BuildCtx,
  FilePath,
  FullSlug,
  GlobalConfiguration,
} from "@quartz-community/types";
import type { LlmsTxtEmitterOptions } from "./types";

const defaultOptions: LlmsTxtEmitterOptions = {
  emitMarkdownMirrors: true,
  emitFullTxt: true,
  sections: {},
  optionalPrefixes: [],
  excludeFromIndex: [],
  description: "",
};

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

const joinSegments = (...segments: string[]): FilePath =>
  segments
    .filter((s) => s.length > 0)
    .join("/")
    .replace(/\/+/g, "/") as FilePath;

const writeFile = async (
  outputDir: string,
  slug: string,
  ext: string,
  content: string,
): Promise<FilePath> => {
  const outputPath = joinSegments(outputDir, `${slug}${ext}`);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, content, "utf8");
  return outputPath;
};

// ---------------------------------------------------------------------------
// Section derivation
// ---------------------------------------------------------------------------

/**
 * Returns the display-name of the `llms.txt` section a slug belongs to.
 *
 * Priority:
 * 1. `optionalPrefixes` match  → `"Optional"`
 * 2. `sections` override       → custom display name
 * 3. Auto-derive from prefix   → capitalised first path segment
 * 4. Root-level slug           → `"Pages"`
 */
export function sectionForSlug(slug: string, options: LlmsTxtEmitterOptions): string {
  const prefix = slug.includes("/") ? slug.split("/")[0]! : null;

  // 1. Optional override
  if (
    prefix !== null &&
    options.optionalPrefixes.some((p) => slug === p || slug.startsWith(`${p}/`))
  ) {
    return "Optional";
  }

  if (prefix === null) {
    // Root-level page (no folder prefix)
    return "Pages";
  }

  // 2. Custom section name
  if (Object.prototype.hasOwnProperty.call(options.sections, prefix)) {
    return options.sections[prefix]!;
  }

  // 3. Auto-derive: capitalise first letter
  return prefix.charAt(0).toUpperCase() + prefix.slice(1);
}

// ---------------------------------------------------------------------------
// llms.txt generator
// ---------------------------------------------------------------------------

/**
 * Generates the llms.txt index content.
 *
 * Format (llmstxt.org v2 spec):
 * ```
 * # Site Title
 *
 * > Description
 *
 * ## Section Name
 * - [Page Title](https://base-url/slug.md): description
 * ```
 */
export function generateLlmsTxt(
  cfg: { configuration: GlobalConfiguration },
  content: ProcessedContent[],
  options: LlmsTxtEmitterOptions,
): string {
  const base = (cfg.configuration.baseUrl ?? "").replace(/\/$/, "");
  const title = cfg.configuration.pageTitle;
  const description = options.description || title;

  // Group pages by section, skipping excluded slugs
  const sections = new Map<string, Array<{ slug: string; title: string; description: string }>>();

  for (const [, vfile] of content) {
    const slug = vfile.data?.slug as string | undefined;
    if (!slug) continue;

    // Skip excluded slugs
    if (
      options.excludeFromIndex.some((prefix) => slug === prefix || slug.startsWith(`${prefix}/`))
    ) {
      continue;
    }

    const fm = (vfile.data?.frontmatter ?? {}) as Record<string, unknown>;
    const pageTitle = (typeof fm["title"] === "string" ? fm["title"] : null) ?? slug;
    const pageDesc = (vfile.data?.description as string | undefined) ?? "";

    const sectionName = sectionForSlug(slug, options);
    if (!sections.has(sectionName)) {
      sections.set(sectionName, []);
    }
    sections.get(sectionName)!.push({ slug, title: pageTitle, description: pageDesc });
  }

  // Sort sections: lexicographic, with "Optional" always last
  const sortedSections = [...sections.entries()].sort(([a], [b]) => {
    if (a === "Optional") return 1;
    if (b === "Optional") return -1;
    return a.localeCompare(b);
  });

  // Build output
  const lines: string[] = [];
  lines.push(`# ${title}`);
  lines.push("");
  lines.push(`> ${description}`);

  for (const [sectionName, pages] of sortedSections) {
    lines.push("");
    lines.push(`## ${sectionName}`);
    lines.push("");
    for (const page of pages) {
      const url = `https://${base}/${page.slug}.md`;
      const entry = page.description
        ? `- [${page.title}](${url}): ${page.description}`
        : `- [${page.title}](${url})`;
      lines.push(entry);
    }
  }

  lines.push("");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// llms-full.txt generator
// ---------------------------------------------------------------------------

/**
 * Generates the llms-full.txt concatenation content.
 * Reads raw source markdown from each page's file on disk.
 * Pages with no filePath (virtual pages) are skipped silently.
 */
export async function generateLlmsFullTxt(
  content: ProcessedContent[],
  options: LlmsTxtEmitterOptions,
): Promise<string> {
  const parts: string[] = [];

  for (const [, vfile] of content) {
    const slug = vfile.data?.slug as string | undefined;
    if (!slug) continue;

    // Skip excluded slugs
    if (
      options.excludeFromIndex.some((prefix) => slug === prefix || slug.startsWith(`${prefix}/`))
    ) {
      continue;
    }

    const filePath = vfile.data?.filePath as string | undefined;
    if (!filePath) continue; // virtual page — skip

    const fm = (vfile.data?.frontmatter ?? {}) as Record<string, unknown>;
    const pageTitle = (typeof fm["title"] === "string" ? fm["title"] : null) ?? slug;

    let source: string;
    try {
      source = await fs.readFile(filePath, "utf8");
    } catch {
      continue; // source file unreadable — skip
    }

    if (parts.length > 0) {
      parts.push("---");
      parts.push("");
    }
    parts.push(`## ${pageTitle} (${slug})`);
    parts.push("");
    parts.push(source.trimEnd());
    parts.push("");
  }

  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Emitter factory
// ---------------------------------------------------------------------------

export const LlmsTxtEmitter: QuartzEmitterPlugin<Partial<LlmsTxtEmitterOptions>> = (
  userOptions?: Partial<LlmsTxtEmitterOptions>,
) => {
  const options: LlmsTxtEmitterOptions = { ...defaultOptions, ...userOptions };

  const emitAll = async (ctx: BuildCtx, content: ProcessedContent[]): Promise<FilePath[]> => {
    const emitted: FilePath[] = [];

    // 1. Emit llms.txt
    const llmsTxtContent = generateLlmsTxt(ctx.cfg, content, options);
    emitted.push(await writeFile(ctx.argv.output, "llms", ".txt", llmsTxtContent));

    // 2. Emit llms-full.txt (optional)
    if (options.emitFullTxt) {
      const fullTxt = await generateLlmsFullTxt(content, options);
      emitted.push(await writeFile(ctx.argv.output, "llms-full", ".txt", fullTxt));
    }

    // 3. Emit .md mirrors (optional)
    if (options.emitMarkdownMirrors) {
      for (const [, vfile] of content) {
        const slug = vfile.data?.slug as string | undefined;
        if (!slug) continue;

        const filePath = vfile.data?.filePath as string | undefined;
        if (!filePath) continue; // virtual page — skip

        let source: string;
        try {
          source = await fs.readFile(filePath, "utf8");
        } catch {
          continue;
        }

        emitted.push(await writeFile(ctx.argv.output, slug as FullSlug, ".md", source));
      }
    }

    return emitted;
  };

  return {
    name: "LlmsTxtEmitter",

    async emit(ctx, content, _resources) {
      return emitAll(ctx, content);
    },

    async partialEmit(ctx, content, _resources, _changeEvents) {
      // Always re-emit everything: llms.txt and llms-full.txt require the full content list.
      return emitAll(ctx, content);
    },
  };
};
