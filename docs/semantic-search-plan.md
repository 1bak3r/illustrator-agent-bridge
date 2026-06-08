# Semantic Search Plan

The semantic search layer should answer visual and factual grounding questions before Illustrator commands are generated.

## Retrieval Targets

- Object semantics: what parts and proportions define a requested object.
- Style references: house cartoon style, line weight, palette, figure conventions.
- Publication requirements: target journal, aspect ratio, export format, minimum text size, color accessibility.
- Existing artwork state: named layers, object IDs, artboard bounds, swatches, fonts.

## Initial Index Shape

Each indexed item should include:

- `id`
- `source`
- `kind`: `object_semantics`, `style_reference`, `publication_requirement`, or `document_state`
- `text`
- `tags`
- optional image/file references

## Planner Contract

The LLM planner should produce:

1. Retrieved evidence IDs used.
2. A scene plan in semantic terms.
3. A bridge command or native MCP tool call.
4. A QA checklist for the exported result.

No Illustrator mutation should happen from raw search text alone. Search informs the plan; the bridge still validates the concrete command.
