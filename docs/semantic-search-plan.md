# Semantic Search Plan

The semantic search layer should answer visual and factual grounding questions before Illustrator commands are generated.

The repo currently includes a deterministic local search baseline in `data/semantic-corpus.json` and `src/semantic/search.ts`. It uses tokenization, light query expansion, and BM25-style ranking. This is the retrieval contract for the first agent loop; embeddings can replace or augment the ranker later without changing the planner contract.

The first planner is `plan:cartoon` / `plan_cartoon_scene_job`. It retrieves evidence, builds a conservative vector scene, runs static QA checks for figure size, text size, named elements, stroke consistency, and element count, then generates an Illustrator JSX job.

The first orchestrated fallback is `workflow:cartoon` / `prepare_cartoon_publication_workflow`. It prepares the scene job, prepares the export job, and returns a runbook that an agent browser can follow while polling result JSON files with `job:wait` or `bridge_wait_for_job_result`.

After export, `qa:export` / `qa_export_artifact` runs structural artifact QA. It does not replace human/LLM visual inspection, but it catches missing files, wrong formats, tiny exports, missing SVG vector elements, and missing PDF page structure before the agent proceeds.

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
