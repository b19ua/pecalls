import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/audio/$callId")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const url = new URL(request.url);
        const token = url.searchParams.get("t");
        const owner = url.searchParams.get("o");
        if (!token || !owner) return new Response("missing token", { status: 401 });

        const { verifyAudioToken, getResidencyConfig, isSelfHosted, fetchGatewayBinary } =
          await import("@/lib/data-residency.server");

        if (!verifyAudioToken(token, params.callId, owner)) {
          return new Response("invalid or expired token", { status: 401 });
        }

        const { data: call } = await supabaseAdmin
          .from("calls")
          .select("id, owner_id, data_residency, external_call_ref, recording_path")
          .eq("id", params.callId)
          .maybeSingle();
        if (!call || call.owner_id !== owner) return new Response("not found", { status: 404 });

        // Cloud-stored audio: just stream the signed URL bytes (or redirect).
        if (call.data_residency !== "self_hosted") {
          if (!call.recording_path) return new Response("no audio", { status: 404 });
          const { data: signed } = await supabaseAdmin.storage
            .from("call-recordings")
            .createSignedUrl(call.recording_path, 60 * 10);
          if (!signed?.signedUrl) return new Response("no audio", { status: 404 });
          return Response.redirect(signed.signedUrl, 302);
        }

        // Self-hosted: proxy bytes from the client's gateway (VPN-friendly).
        const cfg = await getResidencyConfig(owner);
        if (!isSelfHosted(cfg)) return new Response("gateway not configured", { status: 502 });
        const ref = call.external_call_ref ?? call.id;
        const upstream = await fetchGatewayBinary(cfg, `/calls/${encodeURIComponent(ref)}/audio`);
        if (!upstream.ok || !upstream.body) {
          return new Response("gateway error", { status: 502 });
        }
        return new Response(upstream.body, {
          status: 200,
          headers: {
            "content-type": upstream.headers.get("content-type") ?? "audio/mpeg",
            "cache-control": "private, max-age=0, no-store",
          },
        });
      },
    },
  },
});
