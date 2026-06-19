// Background processing of knowledge documents.
// Triggered by client right after upload; returns immediately while
// extraction + chunking + embedding run in EdgeRuntime.waitUntil.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supa = createClient(SUPABASE_URL, SERVICE_ROLE);

function chunkText(text: string, size = 1200, overlap = 200): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const out: string[] = [];
  let i = 0;
  while (i < clean.length) {
    out.push(clean.slice(i, i + size));
    i += size - overlap;
  }
  return out;
}

async function extractText(bytes: Uint8Array, mime: string, name: string): Promise<string> {
  const n = name.toLowerCase();
  if (mime.startsWith("text/") || n.endsWith(".txt") || n.endsWith(".md")) {
    return new TextDecoder().decode(bytes);
  }
  if (mime === "application/pdf" || n.endsWith(".pdf")) {
    if (!GEMINI_KEY) throw new Error("Missing GEMINI_API_KEY");
    let bin = "";
    const cs = 0x8000;
    for (let i = 0; i < bytes.length; i += cs) {
      bin += String.fromCharCode(...bytes.subarray(i, i + cs));
    }
    const b64 = btoa(bin);
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            role: "user",
            parts: [
              { text: "Extract all readable text from this document. Plain text only, preserve paragraphs." },
              { inlineData: { mimeType: "application/pdf", data: b64 } },
            ],
          }],
        }),
      },
    );
    if (!r.ok) throw new Error(`PDF extract ${r.status}: ${await r.text()}`);
    const j = await r.json();
    return j.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || "").join("") ?? "";
  }
  if (n.endsWith(".docx") || mime.includes("wordprocessingml")) {
    // mammoth in deno
    const mammoth = await import("npm:mammoth@1.8.0");
    const result = await mammoth.extractRawText({ buffer: bytes });
    return result.value;
  }
  throw new Error(`Unsupported file: ${mime || name}`);
}

async function embedBatch(texts: string[]): Promise<number[][]> {
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents?key=${GEMINI_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: texts.map((t) => ({
          model: "models/gemini-embedding-001",
          content: { parts: [{ text: t }] },
        })),
      }),
    },
  );
  if (!r.ok) throw new Error(`Embed ${r.status}: ${await r.text()}`);
  const j = await r.json();
  return (j.embeddings as { values: number[] }[]).map((e) => e.values);
}

async function processDocument(documentId: string) {
  const { data: doc } = await supa.from("knowledge_documents").select("*").eq("id", documentId).single();
  if (!doc) return;
  await supa.from("knowledge_documents").update({ status: "processing", error_message: null }).eq("id", doc.id);
  try {
    const { data: file, error: dlErr } = await supa.storage.from("knowledge-files").download(doc.file_path);
    if (dlErr || !file) throw new Error(`Download: ${dlErr?.message}`);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const text = await extractText(bytes, doc.mime_type ?? "", doc.file_name);
    if (!text.trim()) throw new Error("No extractable text");

    const chunks = chunkText(text);
    if (!chunks.length) throw new Error("Empty after chunking");

    await supa.from("knowledge_chunks").delete().eq("document_id", doc.id);

    const batchSize = 32;
    let inserted = 0;
    for (let i = 0; i < chunks.length; i += batchSize) {
      const slice = chunks.slice(i, i + batchSize);
      const embeddings = await embedBatch(slice);
      const rows = slice.map((content, idx) => ({
        document_id: doc.id,
        agent_id: doc.agent_id,
        owner_id: doc.owner_id,
        content,
        chunk_index: i + idx,
        embedding: embeddings[idx] as unknown as string,
        token_count: Math.ceil(content.length / 4),
      }));
      const { error: insErr } = await supa.from("knowledge_chunks").insert(rows);
      if (insErr) throw new Error(`Insert chunks: ${insErr.message}`);
      inserted += rows.length;
    }

    await supa.from("knowledge_documents")
      .update({ status: "ready", chunk_count: inserted, error_message: null })
      .eq("id", doc.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[process-knowledge]", documentId, message);
    await supa.from("knowledge_documents")
      .update({ status: "failed", error_message: message.slice(0, 1000) })
      .eq("id", doc.id);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  try {
    const { documentId } = await req.json();
    if (!documentId || typeof documentId !== "string") {
      return new Response(JSON.stringify({ error: "documentId required" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }
    // Run in background; respond immediately.
    // @ts-ignore EdgeRuntime is provided by Supabase
    EdgeRuntime.waitUntil(processDocument(documentId));
    return new Response(JSON.stringify({ ok: true, status: "queued" }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
