import { createRequire } from 'module';
import path from 'path';
import fs from 'fs/promises';

createRequire(import.meta.url);
var defaultOptions = {
  emitMarkdownMirrors: true,
  emitFullTxt: true,
  sections: {},
  optionalPrefixes: [],
  excludeFromIndex: [],
  description: ""
};
var joinSegments = (...segments) => segments.filter((s) => s.length > 0).join("/").replace(/\/+/g, "/");
var writeFile = async (outputDir, slug, ext, content) => {
  const outputPath = joinSegments(outputDir, `${slug}${ext}`);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, content, "utf8");
  return outputPath;
};
function sectionForSlug(slug, options) {
  const prefix = slug.includes("/") ? slug.split("/")[0] : null;
  if (prefix !== null && options.optionalPrefixes.some((p) => slug === p || slug.startsWith(`${p}/`))) {
    return "Optional";
  }
  if (prefix === null) {
    return "Pages";
  }
  if (Object.prototype.hasOwnProperty.call(options.sections, prefix)) {
    return options.sections[prefix];
  }
  return prefix.charAt(0).toUpperCase() + prefix.slice(1);
}
function generateLlmsTxt(cfg, content, options) {
  const base = (cfg.configuration.baseUrl ?? "").replace(/\/$/, "");
  const title = cfg.configuration.pageTitle;
  const description = options.description || title;
  const sections = /* @__PURE__ */ new Map();
  for (const [, vfile] of content) {
    const slug = vfile.data?.slug;
    if (!slug) continue;
    if (options.excludeFromIndex.some((prefix) => slug === prefix || slug.startsWith(`${prefix}/`))) {
      continue;
    }
    const fm = vfile.data?.frontmatter ?? {};
    const pageTitle = (typeof fm["title"] === "string" ? fm["title"] : null) ?? slug;
    const pageDesc = vfile.data?.description ?? "";
    const sectionName = sectionForSlug(slug, options);
    if (!sections.has(sectionName)) {
      sections.set(sectionName, []);
    }
    sections.get(sectionName).push({ slug, title: pageTitle, description: pageDesc });
  }
  const sortedSections = [...sections.entries()].sort(([a], [b]) => {
    if (a === "Optional") return 1;
    if (b === "Optional") return -1;
    return a.localeCompare(b);
  });
  const lines = [];
  lines.push(`# ${title}`);
  lines.push("");
  lines.push(`> ${description}`);
  for (const [sectionName, pages] of sortedSections) {
    lines.push("");
    lines.push(`## ${sectionName}`);
    lines.push("");
    for (const page of pages) {
      const url = `https://${base}/${page.slug}.md`;
      const entry = page.description ? `- [${page.title}](${url}): ${page.description}` : `- [${page.title}](${url})`;
      lines.push(entry);
    }
  }
  lines.push("");
  return lines.join("\n");
}
async function generateLlmsFullTxt(content, options) {
  const parts = [];
  for (const [, vfile] of content) {
    const slug = vfile.data?.slug;
    if (!slug) continue;
    if (options.excludeFromIndex.some((prefix) => slug === prefix || slug.startsWith(`${prefix}/`))) {
      continue;
    }
    const filePath = vfile.data?.filePath;
    if (!filePath) continue;
    const fm = vfile.data?.frontmatter ?? {};
    const pageTitle = (typeof fm["title"] === "string" ? fm["title"] : null) ?? slug;
    let source;
    try {
      source = await fs.readFile(filePath, "utf8");
    } catch {
      continue;
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
var LlmsTxtEmitter = (userOptions) => {
  const options = { ...defaultOptions, ...userOptions };
  const emitAll = async (ctx, content) => {
    const emitted = [];
    const llmsTxtContent = generateLlmsTxt(ctx.cfg, content, options);
    emitted.push(await writeFile(ctx.argv.output, "llms", ".txt", llmsTxtContent));
    if (options.emitFullTxt) {
      const fullTxt = await generateLlmsFullTxt(content, options);
      emitted.push(await writeFile(ctx.argv.output, "llms-full", ".txt", fullTxt));
    }
    if (options.emitMarkdownMirrors) {
      for (const [, vfile] of content) {
        const slug = vfile.data?.slug;
        if (!slug) continue;
        const filePath = vfile.data?.filePath;
        if (!filePath) continue;
        let source;
        try {
          source = await fs.readFile(filePath, "utf8");
        } catch {
          continue;
        }
        emitted.push(await writeFile(ctx.argv.output, slug, ".md", source));
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
      return emitAll(ctx, content);
    }
  };
};

export { LlmsTxtEmitter };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map