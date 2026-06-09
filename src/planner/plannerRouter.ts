import type { SemanticItem } from "../semantic/types.js";
import { planCartoonScene, type CartoonPlan, type CartoonPlanOptions } from "./cartoonPlanner.js";
import { hasOpenAiPlannerConfig, planCartoonSceneWithOpenAI, type OpenAiCartoonPlannerOptions, type PlannerMode } from "./openAiCartoonPlanner.js";

export interface RoutedPlannerOptions extends CartoonPlanOptions {
  plannerMode?: PlannerMode;
  openAiModel?: string;
  openAiApiKey?: string;
  openAiBaseUrl?: string;
}

export async function planCartoonSceneWithMode(prompt: string, corpus: SemanticItem[], options: RoutedPlannerOptions = {}): Promise<CartoonPlan> {
  const mode = options.plannerMode ?? "deterministic";

  if (mode === "openai" || (mode === "auto" && hasOpenAiPlannerConfig({ apiKey: options.openAiApiKey }))) {
    return planCartoonSceneWithOpenAI(prompt, corpus, openAiOptions(options));
  }

  const plan = planCartoonScene(prompt, corpus, options);
  if (mode === "auto") {
    return {
      ...plan,
      notes: ["Planner mode auto used deterministic fallback because OPENAI_API_KEY is not set.", ...plan.notes]
    };
  }

  return plan;
}

function openAiOptions(options: RoutedPlannerOptions): OpenAiCartoonPlannerOptions {
  return {
    width: options.width,
    height: options.height,
    title: options.title,
    evidenceLimit: options.evidenceLimit,
    apiKey: options.openAiApiKey,
    model: options.openAiModel,
    baseUrl: options.openAiBaseUrl
  };
}

export type { PlannerMode } from "./openAiCartoonPlanner.js";
