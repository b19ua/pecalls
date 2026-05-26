import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Chunk text into ~1000-char windows with 150-char overlap
function chunkText(text: string, size = 1000, overlap = 150): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const chunks: string[] = [];
  let i = 0;
  while (i < clean.length) {
    chunks.push(clean.slice(i, i + size));
    i += size - overlap;
  }
  return chunks;
}

async function extractText(bytes: Uint8Array, mime: string, fileName: string): Promise<string> {
  const lower = fileName.toLowerCase();
  if (mime.startsWith("text/") || lower.endsWith(".txt") || lower.endsWith(".md")) {
    return new TextDecoder().decode(bytes);
  }
  if (mime === "application/pdf" || lower.endsWith(".pdf")) {
    // Use Gemini multimodal to extract text from PDF (direct Google API)
    const apiKey = process.env.GEMINI_API_KEY!;
    if (!apiKey) throw new Error("Missing GEMINI_API_KEY");
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    const b64 = btoa(binary);
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            role: "user",
            parts: [
              { text: "Extract all readable text from this document. Return plain text only, preserve paragraph structure." },
              { inlineData: { mimeType: "application/pdf", data: b64 } },
            ],
          }],
        }),
      },
    );
    if (!res.ok) throw new Error(`PDF extraction failed: ${res.status} ${await res.text()}`);
    const json = await res.json();
    return json.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || "").join("") ?? "";
  }
  if (
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lower.endsWith(".docx")
  ) {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    return result.value;
  }
  throw new Error(`Unsupported file type: ${mime || fileName}`);
}

async function embedBatch(texts: string[]): Promise<number[][]> {
  const apiKey = process.env.LOVABLE_API_KEY!;
  const res = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-embedding-001",
      input: texts,
    }),
  });
  if (!res.ok) throw new Error(`Embedding failed: ${res.status} ${await res.text()}`);
  const json = await res.json();
  return json.data.map((d: { embedding: number[] }) => d.embedding);
}

export const processDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ documentId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: doc, error: docErr } = await supabase
      .from("knowledge_documents")
      .select("*")
      .eq("id", data.documentId)
      .eq("owner_id", userId)
      .single();
    if (docErr || !doc) throw new Error("Document not found");

    await supabase
      .from("knowledge_documents")
      .update({ status: "processing", error_message: null })
      .eq("id", doc.id);

    try {
      const { data: file, error: dlErr } = await supabase.storage
        .from("knowledge-files")
        .download(doc.file_path);
      if (dlErr || !file) throw new Error(`Download failed: ${dlErr?.message}`);

      const bytes = new Uint8Array(await file.arrayBuffer());
      const text = await extractText(bytes, doc.mime_type ?? "", doc.file_name);
      if (!text.trim()) throw new Error("No extractable text");

      const chunks = chunkText(text);
      if (chunks.length === 0) throw new Error("Empty after chunking");

      // Remove old chunks for re-processing
      await supabase.from("knowledge_chunks").delete().eq("document_id", doc.id);

      // Batch embed in groups of 32
      const batchSize = 32;
      let inserted = 0;
      for (let i = 0; i < chunks.length; i += batchSize) {
        const slice = chunks.slice(i, i + batchSize);
        const embeddings = await embedBatch(slice);
        const rows = slice.map((content, idx) => ({
          document_id: doc.id,
          agent_id: doc.agent_id,
          owner_id: userId,
          content,
          chunk_index: i + idx,
          embedding: embeddings[idx] as unknown as string,
          token_count: Math.ceil(content.length / 4),
        }));
        const { error: insErr } = await supabase.from("knowledge_chunks").insert(rows);
        if (insErr) throw new Error(`Insert chunks failed: ${insErr.message}`);
        inserted += rows.length;
      }

      await supabase
        .from("knowledge_documents")
        .update({ status: "ready", chunk_count: inserted, error_message: null })
        .eq("id", doc.id);

      return { ok: true, chunks: inserted };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await supabase
        .from("knowledge_documents")
        .update({ status: "failed", error_message: message })
        .eq("id", doc.id);
      throw err;
    }
  });
