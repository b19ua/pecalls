// Helpers for formatting and downloading call transcripts as text & PDF.
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

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
  sentiment?: "positive" | "neutral" | "negative" | null;
  sentiment_score?: number | null;
  complaint_flag?: boolean | null;
  competitor_mentioned?: boolean | null;
  competitor_names?: string[] | null;
  topics?: string[] | null;
};

function fmtDate(iso: string, locale: string) {
  try { return new Date(iso).toLocaleString(locale); } catch { return iso; }
}

export function roleLabel(role?: string) {
  const r = (role ?? "").toLowerCase();
  if (r === "agent" || r === "assistant") return "AGENT";
  if (r === "user" || r === "customer" || r === "caller") return "CALLER";
  if (r === "system") return "SYSTEM";
  return (role ?? "—").toUpperCase();
}

/** Merge consecutive items from the same speaker into a single paragraph. */
export function groupTranscriptByTurn(items: TranscriptItem[]): { role: string; text: string; at?: string }[] {
  const out: { role: string; text: string; at?: string }[] = [];
  for (const it of items) {
    const role = roleLabel(it.role ?? it.source);
    const text = (it.text ?? "").trim();
    if (!text) continue;
    const prev = out[out.length - 1];
    if (prev && prev.role === role) {
      prev.text += " " + text;
    } else {
      out.push({ role, text, at: it.at ?? it.ts });
    }
  }
  return out;
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

function badge(call: CallLike): string {
  const parts: string[] = [];
  if (call.sentiment) parts.push(`Sentiment: ${call.sentiment}`);
  if (call.complaint_flag) parts.push("⚠ Potential complaint");
  if (call.competitor_mentioned) parts.push(`⚑ Competitor: ${(call.competitor_names ?? []).join(", ") || "yes"}`);
  if (call.topics?.length) parts.push(`Topics: ${call.topics.join(", ")}`);
  return parts.join("  ·  ");
}

export function formatCallTranscript(call: CallLike, locale = "en-US"): string {
  const rawTr: TranscriptItem[] = Array.isArray(call.transcript) ? (call.transcript as TranscriptItem[]) : [];
  const tr = groupTranscriptByTurn(rawTr);
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
  const b = badge(call);
  if (b) lines.push(`  Quality    : ${b}`);
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
      lines.push(`  ${it.role}${it.at ? `  [${it.at}]` : ""}:`);
      for (const w of wrap(it.text, 68)) lines.push(`     ${w}`);
      lines.push("");
    }
  }
  lines.push(hr);
  return lines.join("\n");
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

/* =========================== PDF ============================== */

function header(doc: jsPDF, title: string, subtitle?: string) {
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), 64, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("LUNARA", 40, 32);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(180, 200, 230);
  doc.text("AI Voice Call Platform", 40, 48);
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(title, doc.internal.pageSize.getWidth() - 40, 32, { align: "right" });
  if (subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(subtitle, doc.internal.pageSize.getWidth() - 40, 48, { align: "right" });
  }
  doc.setTextColor(0, 0, 0);
}

function footer(doc: jsPDF) {
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    const w = doc.internal.pageSize.getWidth();
    const h = doc.internal.pageSize.getHeight();
    doc.text(`Page ${i} / ${pages}`, w - 40, h - 20, { align: "right" });
    doc.text(`Lunara — generated ${new Date().toLocaleString()}`, 40, h - 20);
  }
}

export function downloadCallTranscriptPdf(call: CallLike, locale = "en-US") {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  header(doc, "Call transcript", new Date(call.started_at ?? call.created_at).toLocaleString(locale));

  let y = 90;
  doc.setFont("helvetica", "bold"); doc.setFontSize(11);
  doc.text("Call details", 40, y); y += 14;
  doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  const meta = [
    `ID: ${call.id}`,
    `Direction: ${call.direction}`,
    `${call.from_number ?? "—"}  →  ${call.to_number ?? "—"}`,
    `Status: ${call.status}    Duration: ${call.duration_seconds}s`,
  ];
  meta.forEach((m) => { doc.text(m, 40, y); y += 13; });
  const b = badge(call);
  if (b) { doc.setTextColor(60, 60, 60); doc.text(b, 40, y); y += 13; doc.setTextColor(0, 0, 0); }

  if (call.summary) {
    y += 8;
    doc.setFont("helvetica", "bold"); doc.text("Summary", 40, y); y += 13;
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(String(call.summary), 515) as string[];
    lines.forEach((ln) => { if (y > 780) { doc.addPage(); y = 60; } doc.text(ln, 40, y); y += 12; });
  }

  y += 8;
  doc.setFont("helvetica", "bold"); doc.text("Conversation", 40, y); y += 14;
  const turns = groupTranscriptByTurn(Array.isArray(call.transcript) ? (call.transcript as TranscriptItem[]) : []);
  if (!turns.length) {
    doc.setFont("helvetica", "italic"); doc.setTextColor(120);
    doc.text("(no transcript available)", 40, y);
  } else {
    for (const t of turns) {
      if (y > 780) { doc.addPage(); y = 60; }
      doc.setFont("helvetica", "bold");
      doc.setTextColor(t.role === "AGENT" ? 30 : 200, 100, t.role === "AGENT" ? 200 : 30);
      doc.text(`${t.role}${t.at ? `   ${t.at}` : ""}`, 40, y);
      doc.setTextColor(0, 0, 0);
      y += 12;
      doc.setFont("helvetica", "normal");
      const lines = doc.splitTextToSize(t.text, 515) as string[];
      lines.forEach((ln) => { if (y > 790) { doc.addPage(); y = 60; } doc.text(ln, 50, y); y += 12; });
      y += 6;
    }
  }
  footer(doc);
  doc.save(`call-${call.id.slice(0, 8)}-${new Date(call.created_at).toISOString().slice(0, 10)}.pdf`);
}

export type PeriodLabel = "day" | "week" | "month" | "all";

export function downloadCallsReportPdf(calls: CallLike[], period: PeriodLabel, locale = "en-US") {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const periodTitle = { day: "Last 24 hours", week: "Last 7 days", month: "Last 30 days", all: "All time" }[period];

  // ---- Cover
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), doc.internal.pageSize.getHeight(), "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold"); doc.setFontSize(40);
  doc.text("LUNARA", 60, 200);
  doc.setFontSize(16); doc.setFont("helvetica", "normal");
  doc.setTextColor(180, 200, 230);
  doc.text("AI Voice Call Platform", 60, 230);
  doc.setFont("helvetica", "bold"); doc.setFontSize(28); doc.setTextColor(255, 255, 255);
  doc.text("Call analytics report", 60, 330);
  doc.setFont("helvetica", "normal"); doc.setFontSize(14); doc.setTextColor(180, 200, 230);
  doc.text(periodTitle, 60, 360);
  doc.setFontSize(11);
  doc.text(`Generated ${new Date().toLocaleString(locale)}`, 60, 380);
  doc.text(`Calls included: ${calls.length}`, 60, 398);
  doc.setTextColor(120, 140, 170); doc.setFontSize(9);
  doc.text("Confidential — internal use only", 60, doc.internal.pageSize.getHeight() - 40);
  doc.setTextColor(0, 0, 0);

  // ---- KPIs page
  doc.addPage();
  header(doc, "Key metrics", periodTitle);
  const total = calls.length;
  const avgDur = total ? Math.round(calls.reduce((a, c) => a + c.duration_seconds, 0) / total) : 0;
  const ok = calls.filter((c) => c.status === "completed").length;
  const successRate = total ? Math.round((ok / total) * 100) : 0;
  const pos = calls.filter((c) => c.sentiment === "positive").length;
  const neg = calls.filter((c) => c.sentiment === "negative").length;
  const neu = calls.filter((c) => c.sentiment === "neutral").length;
  const complaints = calls.filter((c) => c.complaint_flag).length;
  const competitor = calls.filter((c) => c.competitor_mentioned).length;
  const topicCount = new Map<string, number>();
  for (const c of calls) for (const t of c.topics ?? []) topicCount.set(t, (topicCount.get(t) ?? 0) + 1);
  const topTopics = [...topicCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

  const kpis: [string, string][] = [
    ["Total calls", String(total)],
    ["Average duration", `${avgDur}s`],
    ["Success rate", `${successRate}%`],
    ["Positive sentiment", `${pos}`],
    ["Neutral sentiment", `${neu}`],
    ["Negative sentiment", `${neg}`],
    ["Potential complaints", String(complaints)],
    ["Competitor mentions", String(competitor)],
  ];
  let y = 90;
  const colW = 250, colH = 56;
  kpis.forEach(([k, v], i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = 40 + col * (colW + 15);
    const ry = y + row * (colH + 12);
    doc.setFillColor(245, 247, 250); doc.roundedRect(x, ry, colW, colH, 6, 6, "F");
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(110, 120, 140);
    doc.text(k.toUpperCase(), x + 14, ry + 18);
    doc.setFont("helvetica", "bold"); doc.setFontSize(20); doc.setTextColor(15, 23, 42);
    doc.text(v, x + 14, ry + 44);
  });
  doc.setTextColor(0, 0, 0);

  // Sentiment bar chart (manual)
  let cy = y + 4 * (colH + 12) + 20;
  doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.text("Sentiment distribution", 40, cy); cy += 12;
  const maxS = Math.max(pos, neu, neg, 1);
  const items: [string, number, [number, number, number]][] = [
    ["Positive", pos, [34, 197, 94]],
    ["Neutral", neu, [148, 163, 184]],
    ["Negative", neg, [239, 68, 68]],
  ];
  items.forEach(([lab, val, rgb]) => {
    cy += 18;
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(60);
    doc.text(lab, 40, cy);
    doc.setTextColor(...rgb);
    const w = (val / maxS) * 350;
    doc.setFillColor(...rgb);
    doc.roundedRect(110, cy - 10, Math.max(w, 1), 12, 2, 2, "F");
    doc.setTextColor(60);
    doc.text(String(val), 110 + Math.max(w, 1) + 6, cy);
  });
  doc.setTextColor(0, 0, 0);

  // Top topics
  if (topTopics.length) {
    cy += 30;
    doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.text("Top topics", 40, cy);
    autoTable(doc, {
      startY: cy + 8,
      head: [["Topic", "Mentions"]],
      body: topTopics.map(([t, n]) => [t, n.toString()]),
      styles: { fontSize: 10 },
      headStyles: { fillColor: [15, 23, 42] },
      margin: { left: 40, right: 40 },
    });
  }

  // ---- Calls table
  doc.addPage();
  header(doc, "Calls", periodTitle);
  autoTable(doc, {
    startY: 90,
    head: [["Date", "Dir", "From → To", "Dur", "Status", "Sent.", "Flags"]],
    body: calls.map((c) => [
      new Date(c.created_at).toLocaleString(locale),
      c.direction,
      `${c.from_number ?? "—"} → ${c.to_number ?? "—"}`,
      `${c.duration_seconds}s`,
      c.status,
      c.sentiment ?? "—",
      [c.complaint_flag ? "⚠" : "", c.competitor_mentioned ? "⚑" : ""].filter(Boolean).join(" "),
    ]),
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [15, 23, 42] },
    margin: { left: 40, right: 40 },
    didDrawPage: () => header(doc, "Calls", periodTitle),
  });

  // ---- Transcripts appendix
  doc.addPage();
  header(doc, "Appendix — transcripts", periodTitle);
  let yy = 90;
  for (const c of calls.slice(0, 200)) {
    if (yy > 740) { doc.addPage(); header(doc, "Appendix — transcripts", periodTitle); yy = 90; }
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(15, 23, 42);
    doc.text(`${new Date(c.created_at).toLocaleString(locale)}  ·  ${c.direction}  ·  ${c.duration_seconds}s`, 40, yy);
    yy += 12;
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(110);
    doc.text(`${c.from_number ?? "—"} → ${c.to_number ?? "—"}   ID ${c.id.slice(0, 8)}   ${badge(c)}`, 40, yy);
    yy += 14;
    doc.setTextColor(0);
    if (c.summary) {
      const lines = doc.splitTextToSize(`Summary: ${c.summary}`, 515) as string[];
      lines.forEach((ln) => { if (yy > 790) { doc.addPage(); yy = 60; } doc.text(ln, 40, yy); yy += 11; });
    }
    const turns = groupTranscriptByTurn(Array.isArray(c.transcript) ? (c.transcript as TranscriptItem[]) : []);
    for (const t of turns) {
      if (yy > 780) { doc.addPage(); yy = 60; }
      doc.setFont("helvetica", "bold"); doc.setFontSize(9);
      doc.text(`${t.role}:`, 40, yy); yy += 10;
      doc.setFont("helvetica", "normal");
      const lines = doc.splitTextToSize(t.text, 505) as string[];
      lines.forEach((ln) => { if (yy > 790) { doc.addPage(); yy = 60; } doc.text(ln, 50, yy); yy += 11; });
      yy += 3;
    }
    yy += 10;
    doc.setDrawColor(230); doc.line(40, yy, 555, yy); yy += 12;
  }

  footer(doc);
  doc.save(`lunara-report-${period}-${new Date().toISOString().slice(0, 10)}.pdf`);
}
