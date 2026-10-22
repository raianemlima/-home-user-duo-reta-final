import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { advanceJob } from "@/lib/pipeline/engine";
import { DUO_HANDLERS } from "@/lib/pipeline/handlers";
import { MemoryPipelineRepository } from "@/lib/pipeline/memory-repository";
import { jobInputHash, planStages } from "@/lib/pipeline/plan";
import type { PipelineDeps, PipelineDocument } from "@/lib/pipeline/types";
import type { SegmentationResult } from "@/lib/segmentation/types";
import { CORPUS_DIR } from "../helpers";

const doc: PipelineDocument = { id: "d1", format: "pdf", sha256: "sha-duo", extractionStatus: "text", pageTexts: [], pageCount: 4 };
const deps: PipelineDeps = { loadDocument: async () => doc, loadOriginal: async () => new Uint8Array(readFileSync(join(CORPUS_DIR, "19-duo-ebook.pdf"))), cleaningMode: "faithful" };

describe("DUO_HANDLERS", () => {
  it("extrai, limpa em modo fiel e segmenta, sem mapa temático", async () => {
    const repo = new MemoryPipelineRepository();
    const { job } = await repo.createJob({ notebookId: "nb", inputHash: jobInputHash([doc], DUO_HANDLERS), stages: planStages([doc], DUO_HANDLERS), maxAttempts: 3 });
    for (let i = 0; i < 10; i += 1) { const outcome = await advanceJob(repo, DUO_HANDLERS, deps, job.id); if (outcome.kind === "done" || outcome.kind === "failed") break; }
    const stages = await repo.listStages(job.id);
    expect(stages.map((stage) => stage.stage)).toEqual(["extraction", "cleaning", "segmentation"]);
    expect(stages.every((stage) => stage.status === "succeeded")).toBe(true);
    const segmentation = stages[2].output as unknown as SegmentationResult;
    const text = segmentation.segments.flatMap((segment) => segment.paragraphs.map((paragraph) => paragraph.text)).join("\n");
    expect(text).toContain("conforme a aula 3");
    expect(segmentation.segments.flatMap((segment) => segment.paragraphs).some((paragraph) => paragraph.kind === "tip")).toBe(true);
  });
});
