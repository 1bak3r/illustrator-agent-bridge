export type SemanticKind =
  | "object_semantics"
  | "shape_recipe"
  | "shape_combination"
  | "scientific_concept"
  | "visual_metaphor"
  | "style_reference"
  | "publication_requirement"
  | "document_state"
  | "illustrator_capability";

export interface SemanticItem {
  id: string;
  kind: SemanticKind;
  title: string;
  text: string;
  tags?: string[];
  source?: string;
}

export interface SemanticSearchOptions {
  limit?: number;
  kind?: SemanticKind;
}

export interface SemanticSearchResult {
  item: SemanticItem;
  score: number;
  snippet: string;
}
