# Examples

## Default (zero-config)

Add the plugin to `quartz.config.yaml` with no options:

```yaml
plugins:
  - source: "github:caseyg/quartz-plugin-llmstxt"
    enabled: true
```

This emits:

- `/llms.txt` — pages grouped by folder, links to `.md` mirrors
- `/llms-full.txt` — all source markdown concatenated
- `/<slug>.md` — raw source mirror for every published page

Example `llms.txt` output for a site with `notes/` and `projects/` folders:

```
# My Quartz Site

> My Quartz Site

## Notes

- [Getting Started](https://example.com/notes/getting-started.md): How to set up your vault.
- [Daily Notes](https://example.com/notes/daily-notes.md)

## Projects

- [Project Alpha](https://example.com/projects/alpha.md): Overview of the alpha project.
```

---

## Customised configuration

```yaml
plugins:
  - source: "github:caseyg/quartz-plugin-llmstxt"
    enabled: true
    options:
      # Custom section display names
      sections:
        notes: "Knowledge Base"
        projects: "Work"
        archive: "Archive"

      # Pages under archive/ go into ## Optional instead of ## Archive
      optionalPrefixes:
        - archive

      # private/ and drafts/ are excluded from llms.txt and llms-full.txt,
      # but still get .md mirrors so their raw source is accessible.
      excludeFromIndex:
        - private
        - drafts

      # Custom site description for the blockquote in llms.txt
      description: "Casey's personal knowledge base on product, design, and engineering."

      # Disable the full-text concatenation (large sites may want this)
      emitFullTxt: false
```

This produces:

```
# My Quartz Site

> Casey's personal knowledge base on product, design, and engineering.

## Knowledge Base

- [Getting Started](https://example.com/notes/getting-started.md)

## Work

- [Project Alpha](https://example.com/projects/alpha.md)

## Optional

- [Old Post](https://example.com/archive/old-post.md)
```

Pages under `private/` and `drafts/` do not appear in `llms.txt`, but their `.md` mirrors are still written to the output directory.
