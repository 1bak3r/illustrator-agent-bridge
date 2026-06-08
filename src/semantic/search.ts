import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { SemanticItem, SemanticKind, SemanticSearchOptions, SemanticSearchResult } from "./types.js";

const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "in",
  "into",
  "is",
  "it",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with"
]);

const QUERY_EXPANSIONS: Record<string, string[]> = {
  cartoon: ["simple", "bold", "outline", "exaggerated", "friendly"],
  figure: ["publication", "readability", "caption", "export"],
  flask: ["glassware", "reaction", "liquid", "neck", "round"],
  lab: ["scientist", "bench", "flask", "goggles"],
  publication: ["readability", "contrast", "vector", "export", "label"],
  scientist: ["head", "goggles", "coat", "lab"],
  vector: ["path", "stroke", "fill", "layer", "illustrator"]
};

export async function loadDefaultCorpus(path = process.env.ILLUSTRATOR_SEMANTIC_CORPUS): Promise<SemanticItem[]> {
  const corpusPath = path ? resolve(path) : resolve(process.cwd(), "data", "semantic-corpus.json");
  const raw = JSON.parse(await readFile(corpusPath, "utf8")) as unknown;

  if (!Array.isArray(raw)) {
    throw new Error(`Semantic corpus must be an array: ${corpusPath}`);
  }

  return raw.map(validateItem);
}

export function searchCorpus(
  query: string,
  corpus: SemanticItem[],
  options: SemanticSearchOptions = {}
): SemanticSearchResult[] {
  const limit = Math.max(1, Math.min(options.limit ?? 5, 25));
  const filtered = options.kind ? corpus.filter((item) => item.kind === options.kind) : corpus;
  const queryTerms = expandQuery(tokenize(query));

  if (queryTerms.length === 0 || filtered.length === 0) {
    return [];
  }

  const documents = filtered.map((item) => ({
    item,
    tokens: tokenize(itemText(item))
  }));
  const avgLength = documents.reduce((total, doc) => total + doc.tokens.length, 0) / documents.length;
  const documentFrequencies = new Map<string, number>();

  for (const term of new Set(queryTerms)) {
    documentFrequencies.set(
      term,
      documents.reduce((count, doc) => count + (doc.tokens.includes(term) ? 1 : 0), 0)
    );
  }

  return documents
    .map((doc) => {
      const tokenCounts = countTokens(doc.tokens);
      const score = queryTerms.reduce((total, term) => {
        const frequency = tokenCounts.get(term) ?? 0;
        if (frequency === 0) {
          return total;
        }

        const idf = inverseDocumentFrequency(documents.length, documentFrequencies.get(term) ?? 0);
        const bm25 = bm25TermScore(frequency, doc.tokens.length, avgLength);
        const tagBonus = doc.item.tags?.map(normalizeToken).includes(term) ? 0.35 : 0;
        return total + idf * bm25 + tagBonus;
      }, 0);

      return {
        item: doc.item,
        score,
        snippet: makeSnippet(doc.item, queryTerms)
      };
    })
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score || left.item.id.localeCompare(right.item.id))
    .slice(0, limit);
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map(normalizeToken)
    .filter((token) => token.length > 1 && !STOPWORDS.has(token));
}

function expandQuery(tokens: string[]): string[] {
  const expanded = new Set<string>(tokens);

  for (const token of tokens) {
    for (const expansion of QUERY_EXPANSIONS[token] ?? []) {
      expanded.add(normalizeToken(expansion));
    }
  }

  return [...expanded];
}

function normalizeToken(token: string): string {
  if (token.endsWith("ies") && token.length > 4) {
    return `${token.slice(0, -3)}y`;
  }

  if (token.endsWith("s") && token.length > 3) {
    return token.slice(0, -1);
  }

  return token;
}

function itemText(item: SemanticItem): string {
  return [item.title, item.kind, item.tags?.join(" "), item.text].filter(Boolean).join(" ");
}

function countTokens(tokens: string[]): Map<string, number> {
  const counts = new Map<string, number>();

  for (const token of tokens) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }

  return counts;
}

function inverseDocumentFrequency(totalDocuments: number, documentFrequency: number): number {
  return Math.log(1 + (totalDocuments - documentFrequency + 0.5) / (documentFrequency + 0.5));
}

function bm25TermScore(frequency: number, documentLength: number, avgLength: number): number {
  const k1 = 1.4;
  const b = 0.75;
  return (frequency * (k1 + 1)) / (frequency + k1 * (1 - b + b * (documentLength / avgLength)));
}

function makeSnippet(item: SemanticItem, queryTerms: string[]): string {
  const sentences = item.text.split(/(?<=[.!?])\s+/g);
  const matching = sentences.find((sentence) => {
    const sentenceTokens = tokenize(sentence);
    return queryTerms.some((term) => sentenceTokens.includes(term));
  });

  return matching ?? sentences[0] ?? item.text.slice(0, 180);
}

function validateItem(input: unknown): SemanticItem {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("Semantic corpus item must be an object");
  }

  const item = input as Record<string, unknown>;
  const id = requiredString(item.id, "id");
  const kind = requiredString(item.kind, "kind") as SemanticKind;

  if (
    kind !== "object_semantics" &&
    kind !== "style_reference" &&
    kind !== "publication_requirement" &&
    kind !== "document_state" &&
    kind !== "illustrator_capability"
  ) {
    throw new Error(`Unsupported semantic corpus kind for ${id}: ${kind}`);
  }

  return {
    id,
    kind,
    title: requiredString(item.title, "title"),
    text: requiredString(item.text, "text"),
    tags: Array.isArray(item.tags) ? item.tags.map((tag) => requiredString(tag, "tag")) : undefined,
    source: item.source === undefined ? undefined : requiredString(item.source, "source")
  };
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Semantic corpus ${name} must be a non-empty string`);
  }

  return value;
}
