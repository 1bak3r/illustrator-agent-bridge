# Semantic Search Plan

The semantic search layer should answer visual and factual grounding questions before Illustrator commands are generated.

The repo currently includes a deterministic local search baseline in `data/semantic-corpus.json` and `src/semantic/search.ts`. It uses tokenization, light query expansion, and BM25-style ranking. This is the retrieval contract for the first agent loop; embeddings can replace or augment the ranker later without changing the planner contract.

The first planner is `plan:cartoon` / `plan_cartoon_scene_job`. It retrieves evidence, builds a conservative vector scene, runs static QA checks for figure size, text size, named elements, stroke consistency, and element count, then generates an Illustrator JSX job.

The scientific concept planner is `plan:scientific` / `plan_scientific_concept_scene_job`. It expands the prompt into multiple semantic searches, retrieves `scientific_concept`, `visual_metaphor`, object, capability, and publication evidence, activates matching modules such as molecular assembly, catalysis, membrane transport, electron transfer, phase separation, or biobased material cycles, then emits a validated Illustrator scene job.

The concrete object planner is `plan:object` / `plan_object_shape_scene_job`. It retrieves `shape_recipe`, learned `shape_combination`, object semantics, style, and publication evidence, then emits named Illustrator vector parts for supported targets (`cat`, `lock`, and `key`). The planner immediately runs `guard_object_shape_scene`; when required parts are missing, the guard returns `nextGoalPrompt` / `nextPrompt` so an agent can reprompt the next iteration instead of accepting a weak drawing.

The executable object workflow is `workflow:object` / `prepare_object_shape_workflow` for job preparation and `workflow:execute-object` / `execute_object_shape_workflow` for one-call execution. It keeps `plan.guard` as a hard gate and supports `maxGuardIterations` so the workflow can feed `nextGoalPrompt` into bounded replanning before Illustrator receives any JSX. If the final guard still fails, it returns the final `nextGoalPrompt` without launching Illustrator; otherwise it creates/runs scene and export jobs. Use `runMode: "com"` on Windows/WSL so Illustrator executes JSX sequentially through COM.

The vector shape learner is `semantic:inspect-vector` / `inspect_vector_shape_files` for read-only inspection, plus `semantic:learn-vector` for writing a merged corpus file. It accepts reviewed SVG, AI, EPS, PDF, and bridge scene JSON files, extracts shape/operator counts, named parts, colors, inferred tags, and SVG or bridge-scene spatial relationships such as “ear above head,” “shackle above body,” or “keyhole inside body,” then emits `shape_combination` semantic items. Those items can be searched with `semantic:search --kind shape_combination` and used as evidence before creating or refining Illustrator shape recipes.

Planner mode defaults to `deterministic`. Passing `--planner auto` or `planner: "auto"` uses the OpenAI scene planner when `OPENAI_API_KEY` is configured, otherwise it records a deterministic fallback note. Passing `--planner openai` requires the OpenAI planner. The LLM path uses retrieved semantic evidence as input, asks for structured scene output, and still normalizes and validates the scene before any JSX is generated.

The first orchestrated fallback is `workflow:cartoon` / `prepare_cartoon_publication_workflow`. It prepares the scene job, prepares the export job, and returns a runbook that an agent browser can follow while launching generated JSX with `job:launch` or `bridge_launch_job` and polling result JSON files with `job:wait` or `bridge_wait_for_job_result`.

The executable fallback is `workflow:execute-cartoon` / `execute_cartoon_publication_workflow`. It uses the same retrieval and planner contract, then performs launch, wait, export, and artifact QA steps. Agents should call it with dry-run enabled before attempting a live Illustrator launch.

For generated concept jobs on Windows/WSL, prefer `job:run-com` / `bridge_run_job_via_com` so Illustrator executes the JSX through COM without desktop script-warning prompts.

After export, `qa:export` / `qa_export_artifact` runs artifact QA. It does not replace human/LLM visual inspection, but it catches missing files, wrong formats, tiny exports, missing SVG vector elements, missing PDF page structure, and blank PNG exports before the agent proceeds.

For concrete objects, run `guard:object` / `guard_object_shape_scene` before exporting or after a planner refinement. This guard checks visible, drawable named vector components such as cat ears, whiskers, tail, and paws; lock shackle, pins, and keyhole; or key bow, hole, shaft, ridge, and teeth. It rejects hidden or zero-size required parts, target-word text labels, and tiny visual footprints so the scene cannot pass by spelling the object name or hiding valid parts at unreadable scale. A later visual/LLM guard can be layered after export, but this local guard catches missing object grammar and weak pre-export readability early.

## Retrieval Targets

- Object semantics: what parts and proportions define a requested object.
- Shape recipes: required named vector components for recognizable objects and their silhouettes.
- Shape combinations: extracted evidence from reviewed vector assets, including element counts, named parts, colors, spatial part relationships, and path/operator signals.
- Style references: house cartoon style, line weight, palette, figure conventions.
- Publication requirements: target journal, aspect ratio, export format, minimum text size, color accessibility.
- Existing artwork state: named layers, object IDs, artboard bounds, swatches, fonts.

## Initial Index Shape

Each indexed item should include:

- `id`
- `source`
- `kind`: `object_semantics`, `shape_recipe`, `shape_combination`, `style_reference`, `publication_requirement`, or `document_state`
- `text`
- `tags`
- optional image/file references

## Planner Contract

The planner should produce:

1. Retrieved evidence IDs used.
2. A scene plan in semantic terms.
3. A bridge command or native MCP tool call.
4. A QA checklist for the exported result.

No Illustrator mutation should happen from raw search text alone. Search informs the plan; the bridge still validates the concrete command.
