// app/lib/kb.ts — local knowledge-base retrieval over data/policies.md.
// Replaces the base repo's AWS Bedrock Knowledge Base dependency: sections
// are split on '## ' headings and scored by keyword overlap (pgvector is
// the v2 upgrade path; the interface stays the same).
import { promises as fs } from "fs";
import path from "path";
import type { RAGSource } from "./utils";

interface Section {
  heading: string;
  body: string;
}

let cachedSections: Section[] | null = null;

async function loadSections(): Promise<Section[]> {
  if (cachedSections) return cachedSections;
  const raw = await fs.readFile(path.join(process.cwd(), "data", "policies.md"), "utf-8");
  cachedSections = raw
    .split(/^## /m)
    .slice(1)
    .map((chunk) => {
      const [heading, ...rest] = chunk.split("\n");
      return { heading: heading.trim(), body: rest.join("\n").trim() };
    });
  return cachedSections;
}

const tokenize = (s: string) =>
  s
    .toLowerCase()
    .split(/[^a-zà-ÿäöüß]+/i)
    .filter((w) => w.length > 2);

export async function retrieveContext(
  query: string,
  _knowledgeBaseId?: string,
  n: number = 3,
): Promise<{ context: string; isRagWorking: boolean; ragSources: RAGSource[] }> {
  try {
    const sections = await loadSections();
    const qTokens = new Set(tokenize(query));
    const scored = sections
      .map((s) => {
        const tokens = tokenize(`${s.heading} ${s.body}`);
        const hits = tokens.filter((t) => qTokens.has(t)).length;
        return { s, score: hits / Math.sqrt(tokens.length + 1) };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, n)
      .filter((x) => x.score > 0);

    if (scored.length === 0) {
      return { context: "", isRagWorking: false, ragSources: [] };
    }

    return {
      context: scored.map((x) => `## ${x.s.heading}\n${x.s.body}`).join("\n\n"),
      isRagWorking: true,
      ragSources: scored.map((x, i) => ({
        id: `policies-${i}`,
        fileName: `policies.md — ${x.s.heading}`,
        snippet: x.s.body.slice(0, 160),
        score: Math.round(x.score * 100) / 100,
      })),
    };
  } catch (error) {
    console.error("KB retrieval error:", error);
    return { context: "", isRagWorking: false, ragSources: [] };
  }
}
