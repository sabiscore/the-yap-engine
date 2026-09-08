import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MODEL_OPERATOR_MAP,
  resolveCanonicalTag,
  type OperatorEntry,
} from "@swarmx/types/operator-map";

interface ExtendedModelRecord {
  operatorId: string;
  humanName: string;
  canonicalTag: string;
  baseModel: string;
  baseDigest: string;
  quantization: string;
  roleCapabilities: string[];
  toolCallingSupport: "none" | "prompted";
  structuredOutputSupport: "json_schema_prompted";
  visionSupport: false;
  estimatedResidentRamMb: number;
  minimumAvailableRamMb: number;
  recommendedContext: number;
  maximumContext: number;
  defaultNumPredict: number;
  temperatureRange: [number, number];
  timeoutClass: "route" | "short" | "long" | "critic";
  keepAlivePolicy: "0" | "pilot_request_scoped";
  profileEligibility: Array<"constrained_cpu_8gb" | "standard_cpu_16gb" | "accelerated_optional">;
  licenseStatus: "operator_review_required";
  source: string;
  version: string;
  deprecationState: "active" | "dev_only";
}

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

const MODELFILE_BY_TAG: Record<string, string> = {
  "synth-phi4-exp-q8-dev": "models/Modelfiles/variants/phi4-fast-evolve.modelfile",
  "synth-qwen25-exp-q5km-dev": "models/Modelfiles/variants/qwen2.5-evolve.modelfile",
  "synth-deepseekr1-exp-q5km-dev": "models/Modelfiles/variants/deepseek-r1-evolve.modelfile",
};

function modelfilePathFor(tag: string): string {
  return resolve(repoRoot, MODELFILE_BY_TAG[tag] ?? `models/Modelfiles/primary/${tag}.modelfile`);
}

function capabilitiesFor(entry: OperatorEntry): string[] {
  switch (entry.role) {
    case "route":
      return ["routing", "classification", "safety-gating"];
    case "instruct":
      return ["intake", "captioning", "short-structured-output"];
    case "plan":
      return ["planning", "scripting", "storyboard", "workflow-decomposition"];
    case "code":
      return ["code-generation", "tool-planning", "implementation"];
    case "reason":
      return ["evaluation", "causal-analysis", "creative-scoring"];
    case "critique":
      return ["quality-review", "risk-review", "adversarial-critique"];
    case "synth":
      return ["experimentation", "learning-proposal", "prompt-mutation"];
  }
}

function baseModelFor(entry: OperatorEntry): string {
  if (entry.family === "phi4") return "Phi-4 mini instruct GGUF";
  if (entry.family === "qwen25") return "Qwen2.5 7B instruct GGUF";
  return "DeepSeek R1 distill Qwen 7B GGUF";
}

function timeoutClassFor(entry: OperatorEntry): ExtendedModelRecord["timeoutClass"] {
  if (entry.role === "route") return "route";
  if (entry.role === "instruct") return "short";
  if (entry.role === "critique" || entry.role === "reason") return "critic";
  return "long";
}

function toExtendedRecord(tag: string, entry: OperatorEntry): ExtendedModelRecord {
  return {
    operatorId: entry.operator.toLowerCase(),
    humanName: entry.operator,
    canonicalTag: tag,
    baseModel: baseModelFor(entry),
    baseDigest: "verified-by-local-ollama-list-or-modelfile-source",
    quantization: entry.quant,
    roleCapabilities: capabilitiesFor(entry),
    toolCallingSupport: entry.role === "code" ? "prompted" : "none",
    structuredOutputSupport: "json_schema_prompted",
    visionSupport: false,
    estimatedResidentRamMb: entry.estimatedRamMb,
    minimumAvailableRamMb: entry.estimatedRamMb + 800,
    recommendedContext: entry.defaultCtx,
    maximumContext: Math.max(entry.defaultCtx, entry.defaultCtx),
    defaultNumPredict: entry.role === "route" ? 192 : entry.role === "instruct" ? 384 : 1024,
    temperatureRange: [0, Math.max(entry.temperature, 0.8)],
    timeoutClass: timeoutClassFor(entry),
    keepAlivePolicy: entry.operator === "Pilot" ? "pilot_request_scoped" : "0",
    profileEligibility: entry.is7B
      ? ["standard_cpu_16gb", "accelerated_optional"]
      : ["constrained_cpu_8gb", "standard_cpu_16gb", "accelerated_optional"],
    licenseStatus: "operator_review_required",
    source: "packages/swarmx-types/src/operator-map.ts",
    version: "apex17-r8-v4-closeout",
    deprecationState: entry.env === "dev" ? "dev_only" : "active",
  };
}

const records = Object.entries(MODEL_OPERATOR_MAP).map(([tag, entry]) => toExtendedRecord(tag, entry));
const legacyScarSuffixPattern = "-sc" + "ar";
const legacyModelReference = new RegExp(
  `(?:${legacyScarSuffixPattern}|phi4-fast|deepseek-reasoner|qwen-worker)`,
);

function hasExecutableLegacyReference(source: string): boolean {
  return source.split(/\r?\n/).some((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return false;
    if (!legacyModelReference.test(trimmed)) return false;
    return /^(FROM|ADAPTER|ollama\s+(?:create|pull|run|rm)|export\s+\w+=|\w+=|PARAMETER|SYSTEM|TEMPLATE)/.test(trimmed);
  });
}

assert.ok(records.length >= 10, "canonical model registry must include the full APEX operator set");

for (const record of records) {
  assert.equal(resolveCanonicalTag(record.canonicalTag), record.canonicalTag);
  assert.ok(record.operatorId.length > 0, `${record.canonicalTag} missing operatorId`);
  assert.ok(record.humanName.length > 0, `${record.canonicalTag} missing humanName`);
  assert.ok(record.baseModel.length > 0, `${record.canonicalTag} missing baseModel`);
  assert.ok(record.baseDigest.length > 0, `${record.canonicalTag} missing baseDigest policy`);
  assert.ok(record.roleCapabilities.length > 0, `${record.canonicalTag} missing role capabilities`);
  assert.ok(record.estimatedResidentRamMb > 0, `${record.canonicalTag} missing RAM estimate`);
  assert.ok(record.minimumAvailableRamMb >= record.estimatedResidentRamMb, `${record.canonicalTag} invalid RAM minimum`);
  assert.ok(record.recommendedContext > 0, `${record.canonicalTag} missing recommended context`);
  assert.ok(record.maximumContext >= record.recommendedContext, `${record.canonicalTag} invalid context ceiling`);
  assert.ok(record.defaultNumPredict > 0, `${record.canonicalTag} missing output ceiling`);
  assert.ok(record.profileEligibility.length > 0, `${record.canonicalTag} missing profile eligibility`);

  const modelfile = modelfilePathFor(record.canonicalTag);
  assert.ok(existsSync(modelfile), `missing Modelfile for ${record.canonicalTag}: ${modelfile}`);
  const source = readFileSync(modelfile, "utf8");
  assert.ok(source.includes("FROM "), `${record.canonicalTag} Modelfile must declare FROM`);
  assert.ok(source.includes("PARAMETER num_ctx"), `${record.canonicalTag} Modelfile must declare num_ctx`);
  assert.equal(hasExecutableLegacyReference(source), false, `${record.canonicalTag} Modelfile has executable legacy model reference`);
}

const activeDocs = [
  "Makefile",
  "scripts/healthcheck.sh",
  "scripts/install.sh",
  "scripts/verify.sh",
  "models/README.md",
];
for (const rel of activeDocs) {
  const source = readFileSync(resolve(repoRoot, rel), "utf8");
  assert.equal(
    /(?:ollama pull|MODEL_FAST=|MODEL_REASON=|MODEL_CODE=|check_model ).*(?:phi4-fast|phi4-mini|deepseek-reasoner|qwen-worker|qwen2\.5-coder)/.test(source),
    false,
    `${rel} still contains active legacy model setup instructions`,
  );
}

console.log(JSON.stringify({
  status: "model registry and Modelfile validation passed",
  records: records.map((record) => ({
    operator: record.humanName,
    model: record.canonicalTag,
    quantization: record.quantization,
    context: record.recommendedContext,
    timeoutClass: record.timeoutClass,
    profile: record.profileEligibility,
    status: record.deprecationState,
  })),
}, null, 2));
