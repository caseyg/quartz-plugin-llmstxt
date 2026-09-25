import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  sectionForSlug,
  generateLlmsTxt,
  generateLlmsFullTxt,
  LlmsTxtEmitter,
} from "../src/emitter";
import type { LlmsTxtEmitterOptions } from "../src/types";
import { assertFilePath, assertFullSlug, createCtx, createProcessedContent } from "./helpers";
import type { GlobalConfiguration } from "@quartz-community/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const defaultOpts = (): LlmsTxtEmitterOptions => ({
  emitMarkdownMirrors: true,
  emitFullTxt: true,
  sections: {},
  optionalPrefixes: [],
  excludeFromIndex: [],
  description: "",
});

const makeCfg = (overrides: Partial<GlobalConfiguration> = {}) => ({
  configuration: {
    pageTitle: "My Site",
    baseUrl: "example.com",
    ...overrides,
  } as GlobalConfiguration,
});

const collectAsync = async <T>(iterable: AsyncIterable<T>): Promise<T[]> => {
  const results: T[] = [];
  for await (const item of iterable) results.push(item);
  return results;
};

// ---------------------------------------------------------------------------
// sectionForSlug
// ---------------------------------------------------------------------------

describe("sectionForSlug", () => {
  it("returns 'Pages' for root-level slugs", () => {
    expect(sectionForSlug("about", defaultOpts())).toBe("Pages");
    expect(sectionForSlug("index", defaultOpts())).toBe("Pages");
  });

  it("auto-derives capitalised section from folder prefix", () => {
    expect(sectionForSlug("notes/my-page", defaultOpts())).toBe("Notes");
    expect(sectionForSlug("projects/thing", defaultOpts())).toBe("Projects");
  });

  it("uses custom section name from sections option", () => {
    const opts = { ...defaultOpts(), sections: { notes: "My Notes" } };
    expect(sectionForSlug("notes/page-a", opts)).toBe("My Notes");
  });

  it("returns 'Optional' for slugs matching optionalPrefixes", () => {
    const opts = { ...defaultOpts(), optionalPrefixes: ["archive"] };
    expect(sectionForSlug("archive/old-note", opts)).toBe("Optional");
  });

  it("optionalPrefixes takes priority over sections", () => {
    const opts = {
      ...defaultOpts(),
      optionalPrefixes: ["notes"],
      sections: { notes: "Important" },
    };
    expect(sectionForSlug("notes/page", opts)).toBe("Optional");
  });
});

// ---------------------------------------------------------------------------
// generateLlmsTxt
// ---------------------------------------------------------------------------

describe("generateLlmsTxt", () => {
  it("produces H1 title and blockquote description", () => {
    const content = [
      createProcessedContent({ slug: assertFullSlug("about"), frontmatter: { title: "About" } }),
    ];
    const output = generateLlmsTxt(makeCfg(), content, defaultOpts());
    expect(output).toContain("# My Site");
    expect(output).toContain("> My Site");
  });

  it("uses description override in blockquote", () => {
    const opts = { ...defaultOpts(), description: "A knowledge base" };
    const content = [
      createProcessedContent({ slug: assertFullSlug("about"), frontmatter: { title: "About" } }),
    ];
    const output = generateLlmsTxt(makeCfg(), content, opts);
    expect(output).toContain("> A knowledge base");
    expect(output).not.toContain("> My Site");
  });

  it("groups folder-structured content into correct sections (spec scenario a)", () => {
    const content = [
      createProcessedContent({
        slug: assertFullSlug("notes/page-a"),
        frontmatter: { title: "Page A" },
      }),
      createProcessedContent({
        slug: assertFullSlug("notes/page-b"),
        frontmatter: { title: "Page B" },
      }),
      createProcessedContent({
        slug: assertFullSlug("projects/thing"),
        frontmatter: { title: "Thing" },
      }),
    ];
    const output = generateLlmsTxt(makeCfg(), content, defaultOpts());
    expect(output).toContain("## Notes");
    expect(output).toContain("## Projects");
    expect(output).toContain("[Page A](https://example.com/notes/page-a.md)");
    expect(output).toContain("[Page B](https://example.com/notes/page-b.md)");
    expect(output).toContain("[Thing](https://example.com/projects/thing.md)");
  });

  it("places root-level pages under ## Pages (spec scenario b)", () => {
    const content = [
      createProcessedContent({ slug: assertFullSlug("about"), frontmatter: { title: "About" } }),
    ];
    const output = generateLlmsTxt(makeCfg(), content, defaultOpts());
    expect(output).toContain("## Pages");
    expect(output).toContain("[About](https://example.com/about.md)");
  });

  it("routes optionalPrefixes to ## Optional (spec scenario c)", () => {
    const opts = { ...defaultOpts(), optionalPrefixes: ["archive"] };
    const content = [
      createProcessedContent({
        slug: assertFullSlug("notes/page"),
        frontmatter: { title: "Note" },
      }),
      createProcessedContent({
        slug: assertFullSlug("archive/old"),
        frontmatter: { title: "Old" },
      }),
    ];
    const output = generateLlmsTxt(makeCfg(), content, opts);
    expect(output).toContain("## Optional");
    expect(output).toContain("[Old](https://example.com/archive/old.md)");
    // Optional section appears after Notes
    const notesPos = output.indexOf("## Notes");
    const optionalPos = output.indexOf("## Optional");
    expect(notesPos).toBeLessThan(optionalPos);
  });

  it("excludes slugs in excludeFromIndex (spec scenario d)", () => {
    const opts = { ...defaultOpts(), excludeFromIndex: ["private"] };
    const content = [
      createProcessedContent({
        slug: assertFullSlug("notes/page"),
        frontmatter: { title: "Note" },
      }),
      createProcessedContent({
        slug: assertFullSlug("private/secret"),
        frontmatter: { title: "Secret" },
      }),
    ];
    const output = generateLlmsTxt(makeCfg(), content, opts);
    expect(output).not.toContain("private/secret");
    expect(output).not.toContain("Secret");
    expect(output).toContain("notes/page");
  });

  it("links point to .md URLs not .html", () => {
    const content = [
      createProcessedContent({
        slug: assertFullSlug("notes/page"),
        frontmatter: { title: "Note" },
      }),
    ];
    const output = generateLlmsTxt(makeCfg(), content, defaultOpts());
    expect(output).toContain(".md)");
    expect(output).not.toContain(".html");
  });
});

// ---------------------------------------------------------------------------
// generateLlmsFullTxt
// ---------------------------------------------------------------------------

describe("generateLlmsFullTxt", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("concatenates page source with separators", async () => {
    vi.spyOn(fs, "readFile").mockResolvedValue("# Note content\n" as never);
    const content = [
      createProcessedContent({
        slug: assertFullSlug("notes/page-a"),
        filePath: assertFilePath("/content/notes/page-a.md"),
        frontmatter: { title: "Page A" },
      }),
      createProcessedContent({
        slug: assertFullSlug("notes/page-b"),
        filePath: assertFilePath("/content/notes/page-b.md"),
        frontmatter: { title: "Page B" },
      }),
    ];
    const output = await generateLlmsFullTxt(content, defaultOpts());
    expect(output).toContain("## Page A (notes/page-a)");
    expect(output).toContain("## Page B (notes/page-b)");
    expect(output).toContain("---");
    expect(output).toContain("# Note content");
  });

  it("excludes slugs in excludeFromIndex", async () => {
    vi.spyOn(fs, "readFile").mockResolvedValue("content" as never);
    const opts = { ...defaultOpts(), excludeFromIndex: ["private"] };
    const content = [
      createProcessedContent({
        slug: assertFullSlug("notes/page"),
        filePath: assertFilePath("/content/notes/page.md"),
        frontmatter: { title: "Note" },
      }),
      createProcessedContent({
        slug: assertFullSlug("private/secret"),
        filePath: assertFilePath("/content/private/secret.md"),
        frontmatter: { title: "Secret" },
      }),
    ];
    const output = await generateLlmsFullTxt(content, opts);
    expect(output).not.toContain("private/secret");
    expect(output).not.toContain("Secret");
    expect(output).toContain("notes/page");
  });

  it("skips pages with no filePath (virtual pages) without throwing (task 4.2)", async () => {
    vi.spyOn(fs, "readFile").mockResolvedValue("real content" as never);
    const content = [
      createProcessedContent({
        slug: assertFullSlug("notes/real"),
        filePath: assertFilePath("/content/notes/real.md"),
        frontmatter: { title: "Real" },
      }),
      // Virtual page — no filePath
      createProcessedContent({
        slug: assertFullSlug("virtual/page"),
        frontmatter: { title: "Virtual" },
      }),
    ];
    let output: string;
    expect(async () => {
      output = await generateLlmsFullTxt(content, defaultOpts());
    }).not.toThrow();
    output = await generateLlmsFullTxt(content, defaultOpts());
    expect(output).toContain("notes/real");
    expect(output).not.toContain("virtual/page");
  });
});

// ---------------------------------------------------------------------------
// LlmsTxtEmitter — integration (spec scenario e: zero-config defaults)
// ---------------------------------------------------------------------------

describe("LlmsTxtEmitter", () => {
  it("emits all three output files with zero config (spec scenario e)", async () => {
    const outputDir = await fs.mkdtemp(path.join(tmpdir(), "quartz-llmstxt-"));

    // Write a fake source file for the mirror
    const fakeSourceDir = await fs.mkdtemp(path.join(tmpdir(), "quartz-src-"));
    const fakeSourceFile = path.join(fakeSourceDir, "page.md");
    await fs.writeFile(fakeSourceFile, "# Hello\n\nContent here.\n", "utf8");

    const cfg = makeCfg();
    const ctx = createCtx({
      argv: { output: outputDir },
      cfg: cfg as never,
    });

    const emitter = LlmsTxtEmitter();
    const content = [
      createProcessedContent({
        slug: assertFullSlug("notes/page"),
        filePath: assertFilePath(fakeSourceFile),
        frontmatter: { title: "Hello" },
      }),
    ];

    const result = await emitter.emit(ctx, content, { css: [], js: [], additionalHead: [] });
    const outputPaths = Array.isArray(result) ? result : await collectAsync(result);

    // llms.txt
    const llmsTxt = outputPaths.find((p) => p.endsWith("llms.txt"));
    expect(llmsTxt).toBeDefined();
    const llmsContent = await fs.readFile(llmsTxt!, "utf8");
    expect(llmsContent).toContain("# My Site");
    expect(llmsContent).toContain("## Notes");
    expect(llmsContent).toContain("[Hello](https://example.com/notes/page.md)");

    // llms-full.txt
    const llmsFullTxt = outputPaths.find((p) => p.endsWith("llms-full.txt"));
    expect(llmsFullTxt).toBeDefined();
    const fullContent = await fs.readFile(llmsFullTxt!, "utf8");
    expect(fullContent).toContain("## Hello (notes/page)");
    expect(fullContent).toContain("# Hello");

    // .md mirror
    const mirror = outputPaths.find((p) => p.endsWith("notes/page.md"));
    expect(mirror).toBeDefined();
    const mirrorContent = await fs.readFile(mirror!, "utf8");
    expect(mirrorContent).toContain("# Hello");
  });

  it("does not emit llms-full.txt when emitFullTxt is false", async () => {
    const outputDir = await fs.mkdtemp(path.join(tmpdir(), "quartz-llmstxt-"));
    const cfg = makeCfg();
    const ctx = createCtx({ argv: { output: outputDir }, cfg: cfg as never });

    const emitter = LlmsTxtEmitter({ emitFullTxt: false });
    const content = [
      createProcessedContent({
        slug: assertFullSlug("notes/page"),
        frontmatter: { title: "Hello" },
      }),
    ];

    const result = await emitter.emit(ctx, content, { css: [], js: [], additionalHead: [] });
    const outputPaths = Array.isArray(result) ? result : await collectAsync(result);
    expect(outputPaths.some((p) => p.endsWith("llms-full.txt"))).toBe(false);
    expect(outputPaths.some((p) => p.endsWith("llms.txt"))).toBe(true);
  });

  it("does not emit .md mirrors when emitMarkdownMirrors is false", async () => {
    const outputDir = await fs.mkdtemp(path.join(tmpdir(), "quartz-llmstxt-"));
    const cfg = makeCfg();
    const ctx = createCtx({ argv: { output: outputDir }, cfg: cfg as never });

    const emitter = LlmsTxtEmitter({ emitMarkdownMirrors: false });
    const content = [
      createProcessedContent({
        slug: assertFullSlug("notes/page"),
        frontmatter: { title: "Hello" },
      }),
    ];

    const result = await emitter.emit(ctx, content, { css: [], js: [], additionalHead: [] });
    const outputPaths = Array.isArray(result) ? result : await collectAsync(result);
    expect(outputPaths.some((p) => p.endsWith(".md"))).toBe(false);
  });

  it("still emits .md mirror for excludeFromIndex slugs (spec scenario d)", async () => {
    const outputDir = await fs.mkdtemp(path.join(tmpdir(), "quartz-llmstxt-"));
    const fakeSourceDir = await fs.mkdtemp(path.join(tmpdir(), "quartz-src-"));
    const fakeSecretFile = path.join(fakeSourceDir, "secret.md");
    await fs.writeFile(fakeSecretFile, "# Secret\n", "utf8");

    const cfg = makeCfg();
    const ctx = createCtx({ argv: { output: outputDir }, cfg: cfg as never });
    const opts = { excludeFromIndex: ["private"] };

    const emitter = LlmsTxtEmitter(opts);
    const content = [
      createProcessedContent({
        slug: assertFullSlug("private/secret"),
        filePath: assertFilePath(fakeSecretFile),
        frontmatter: { title: "Secret" },
      }),
    ];

    const result = await emitter.emit(ctx, content, { css: [], js: [], additionalHead: [] });
    const outputPaths = Array.isArray(result) ? result : await collectAsync(result);

    // Not in llms.txt index
    const llmsTxt = outputPaths.find((p) => p.endsWith("llms.txt"))!;
    const llmsContent = await fs.readFile(llmsTxt, "utf8");
    expect(llmsContent).not.toContain("private/secret");

    // But .md mirror still emitted
    expect(outputPaths.some((p) => p.endsWith("private/secret.md"))).toBe(true);
  });

  it("virtual page (no filePath) is skipped for mirror without throwing (task 4.2)", async () => {
    const outputDir = await fs.mkdtemp(path.join(tmpdir(), "quartz-llmstxt-"));
    const cfg = makeCfg();
    const ctx = createCtx({ argv: { output: outputDir }, cfg: cfg as never });

    const emitter = LlmsTxtEmitter();
    const content = [
      // Virtual page — no filePath
      createProcessedContent({
        slug: assertFullSlug("virtual/page"),
        frontmatter: { title: "Virtual" },
      }),
    ];

    await expect(
      emitter.emit(ctx, content, { css: [], js: [], additionalHead: [] }),
    ).resolves.not.toThrow();
  });
});
