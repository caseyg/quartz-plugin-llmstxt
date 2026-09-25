/**
 * Options for the LlmsTxtEmitter plugin.
 */
interface LlmsTxtEmitterOptions {
    /**
     * Emit a `.md` mirror of every published page at `<slug>.md`.
     * The mirror contains the raw source markdown read from the original file.
     * @default true
     */
    emitMarkdownMirrors: boolean;
    /**
     * Emit `/llms-full.txt`, a single file concatenating the source markdown of
     * every published page (excluding slugs in `excludeFromIndex`).
     * @default true
     */
    emitFullTxt: boolean;
    /**
     * Map folder prefixes to custom display names used as H2 section headings in
     * `llms.txt`. Keys are the first path segment of a slug (e.g. `"notes"`).
     * If a prefix has no entry here, the section name is derived automatically by
     * capitalising the prefix (e.g. `"notes"` → `"Notes"`).
     * @default {}
     */
    sections: Record<string, string>;
    /**
     * Slug prefixes whose pages are placed in the conventional `## Optional`
     * section of `llms.txt` instead of their normal section. Checked before
     * `sections` and auto-derivation.
     * @default []
     */
    optionalPrefixes: string[];
    /**
     * Slug prefixes whose pages are excluded from `llms.txt` and `llms-full.txt`.
     * Pages that match are still emitted as `.md` mirrors when
     * `emitMarkdownMirrors` is `true`.
     * @default []
     */
    excludeFromIndex: string[];
    /**
     * Override the description text placed in the blockquote at the top of
     * `llms.txt`. When empty, the site's `pageTitle` is used.
     * @default ""
     */
    description: string;
}

export type { LlmsTxtEmitterOptions };
