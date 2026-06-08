// Helpers for formatting and downloading call transcripts as nice text files.

export type TranscriptItem = { role?: string; source?: string; text?: string; ts?: string; at?: string };

export type CallLike = {
  id: string;
  direction: "inbound" | "outbound";
  from_number: string | null;
  to_number: string | null;
  status: string;
  duration_seconds: number;
  created_at: string;
  started_at?: string | null;
  transcript: unknown;
  summary?: string | null;
};

function pad(s: string, n: number) {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

function fmtDate(iso: string, locale: string) {
  try { return new Date(iso).toLocaleString(locale); } catch { return iso; }
}

function roleLabel(role?: string) {
  const r = (role ?? "").toLowerCase();
  if (r === "agent" || r === "assistant") return "AGENT";
  if (r === "user" || r === "customer" || r === "caller") return "CALLER";
  if (r === "system") return "SYSTEM";
  return (role ?? "—").toUpperCase();
}

export function formatCallTranscript(call: CallLike, locale = "en-US"): string {
  const tr: TranscriptItem[] = Array.isArray(call.transcript) ? (call.transcript as TranscriptItem[]) : [];
  const lines: string[] = [];
  const hr = "─".repeat(72);
  lines.push(hr);
  lines.push(`  CALL TRANSCRIPT`);
  lines.push(hr);
  lines.push(`  Call ID    : ${call.id}`);
  lines.push(`  Date       : ${fmtDate(call.started_at ?? call.created_at, locale)}`);
  lines.push(`  Direction  : ${call.direction}`);
  lines.push(`  From → To  : ${call.from_number ?? "—"}  →  ${call.to_number ?? "—"}`);
  lines.push(`  Status     : ${call.status}`);
  lines.push(`  Duration   : ${call.duration_seconds}s`);
  lines.push(hr);
  if (call.summary) {
    lines.push(`  SUMMARY`);
    lines.push("");
    for (const ln of String(call.summary).split(/\r?\n/)) lines.push(`  ${ln}`);
    lines.push(hr);
  }
  lines.push(`  CONVERSATION`);
  lines.push("");
  if (tr.length === 0) {
    lines.push(`  (no transcript available)`);
  } else {
    for (const it of tr) {
      const who = pad(roleLabel(it.role ?? it.source), 7);
      const when = it.at ?? it.ts ?? "";
      const head = when ? `[${when}]  ${who} :` : `${who} :`;
      const text = (it.text ?? "").trim();
      const wrapped = wrap(text, 64);
      lines.push(`  ${head}`);
      for (const w of wrapped) lines.push(`            ${w}`);
      lines.push("");
    }
  }
  lines.push(hr);
  return lines.join("\n");
}

function wrap(text: string, width: number): string[] {
  if (!text) return [""];
  const words = text.split(/\s+/);
  const out: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > width) {
      if (cur) out.push(cur);
      cur = w;
    } else {
      cur = (cur ? cur + " " : "") + w;
    }
  }
  if (cur) out.push(cur);
  return out;
}

export function formatManyTranscripts(calls: CallLike[], title: string, locale = "en-US"): string {
  const header = [
    "═".repeat(72),
    `  ${title}`,
    `  Generated: ${new Date().toLocaleString(locale)}`,
    `  Calls: ${calls.length}`,
    "═".repeat(72),
    "",
  ].join("\n");
  return header + "\n" + calls.map((c) => formatCallTranscript(c, locale)).join("\n\n");
}

export function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
