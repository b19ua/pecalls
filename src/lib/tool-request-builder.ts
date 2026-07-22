// Pure request-builder shared between production tool execution
// (voice-call-bridge / asterisk-bridge — kept as mirrored copies to preserve
// their runtime constraints) and the UI "Test connection" server function
// (src/lib/tools.functions.ts::testTool). Any change to the wire-format
// behaviour must be reflected in the two bridge copies to keep tests in the
// UI predictive of production behaviour.

export type ToolParamLite = {
  name: string;
  type?: "string" | "number" | "boolean";
  description?: string;
  required?: boolean;
  query_key?: string;
};

export type ToolConfigLite = {
  url?: string;
  base_url?: string;
  path?: string;
  method?: string;
  auth_header_name?: string;
  auth_header_value?: string;
  parameters?: ToolParamLite[];
  body_template?: string;
  timeout_ms?: number;
  response_hint?: string;
};

export type ToolLite = {
  type: "webhook" | "crm_lookup" | "crm_write";
  config: ToolConfigLite;
};

export type BuiltRequest = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  timeout_ms: number;
};

export function fillTemplate(tmpl: string, args: Record<string, unknown>): string {
  return tmpl.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, k) =>
    args[k] !== undefined ? String(args[k]) : "");
}

export function buildToolRequest(tool: ToolLite, args: Record<string, unknown>): BuiltRequest {
  const cfg = tool.config ?? {};
  const timeout = Math.min(Math.max(cfg.timeout_ms ?? 8000, 500), 20000);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (cfg.auth_header_name && cfg.auth_header_value) {
    headers[cfg.auth_header_name] = cfg.auth_header_value;
  }
  const method = (cfg.method || "POST").toUpperCase();

  const paramMap: Record<string, string> = {};
  for (const p of (cfg.parameters ?? [])) {
    if (p && p.name) paramMap[p.name] = (p.query_key && p.query_key.length > 0) ? p.query_key : p.name;
  }
  const outKey = (k: string) => paramMap[k] ?? k;

  let url = "";
  let body: string | undefined;

  if (tool.type === "webhook") {
    url = cfg.url || "";
    if (method === "GET") {
      const u = new URL(url);
      for (const [k, v] of Object.entries(args)) u.searchParams.append(outKey(k), String(v));
      url = u.toString();
    } else {
      body = JSON.stringify(args);
    }
  } else {
    const base = (cfg.base_url || "").replace(/\/+$/, "");
    const path = fillTemplate(cfg.path || "", args);
    url = `${base}${path.startsWith("/") ? path : "/" + path}`;
    if (method === "GET") {
      const u = new URL(url);
      for (const [k, v] of Object.entries(args)) u.searchParams.append(outKey(k), String(v));
      url = u.toString();
    } else if (cfg.body_template) {
      body = fillTemplate(cfg.body_template, args);
    } else {
      body = JSON.stringify(args);
    }
  }

  return { url, method, headers, body, timeout_ms: timeout };
}
