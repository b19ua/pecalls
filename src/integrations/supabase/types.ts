export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      agent_tools: {
        Row: {
          agent_id: string
          config: Json
          created_at: string
          description: string
          enabled: boolean
          id: string
          name: string
          owner_id: string
          type: string
          updated_at: string
        }
        Insert: {
          agent_id: string
          config?: Json
          created_at?: string
          description?: string
          enabled?: boolean
          id?: string
          name: string
          owner_id: string
          type: string
          updated_at?: string
        }
        Update: {
          agent_id?: string
          config?: Json
          created_at?: string
          description?: string
          enabled?: boolean
          id?: string
          name?: string
          owner_id?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      agents: {
        Row: {
          created_at: string
          description: string | null
          greeting: string
          handoff_dtmf_digit: string | null
          handoff_enabled: boolean
          handoff_numbers: string[]
          handoff_trigger_phrases: string[]
          id: string
          inbound_sip_credential_list_sid: string | null
          inbound_sip_domain: string | null
          inbound_sip_domain_sid: string | null
          inbound_sip_password: string | null
          inbound_sip_slug: string | null
          inbound_sip_username: string | null
          is_active: boolean
          language: string
          max_call_seconds: number
          model: string
          name: string
          outbound_mode: string
          owner_id: string
          record_calls: boolean
          silence_timeout_seconds: number
          sip_domain: string | null
          sip_from_number: string | null
          sip_password: string | null
          sip_route_prefix: string | null
          sip_transport: string
          sip_username: string | null
          system_prompt: string
          temperature: number
          twilio_number_e164: string | null
          updated_at: string
          voice: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          greeting?: string
          handoff_dtmf_digit?: string | null
          handoff_enabled?: boolean
          handoff_numbers?: string[]
          handoff_trigger_phrases?: string[]
          id?: string
          inbound_sip_credential_list_sid?: string | null
          inbound_sip_domain?: string | null
          inbound_sip_domain_sid?: string | null
          inbound_sip_password?: string | null
          inbound_sip_slug?: string | null
          inbound_sip_username?: string | null
          is_active?: boolean
          language?: string
          max_call_seconds?: number
          model?: string
          name: string
          outbound_mode?: string
          owner_id: string
          record_calls?: boolean
          silence_timeout_seconds?: number
          sip_domain?: string | null
          sip_from_number?: string | null
          sip_password?: string | null
          sip_route_prefix?: string | null
          sip_transport?: string
          sip_username?: string | null
          system_prompt?: string
          temperature?: number
          twilio_number_e164?: string | null
          updated_at?: string
          voice?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          greeting?: string
          handoff_dtmf_digit?: string | null
          handoff_enabled?: boolean
          handoff_numbers?: string[]
          handoff_trigger_phrases?: string[]
          id?: string
          inbound_sip_credential_list_sid?: string | null
          inbound_sip_domain?: string | null
          inbound_sip_domain_sid?: string | null
          inbound_sip_password?: string | null
          inbound_sip_slug?: string | null
          inbound_sip_username?: string | null
          is_active?: boolean
          language?: string
          max_call_seconds?: number
          model?: string
          name?: string
          outbound_mode?: string
          owner_id?: string
          record_calls?: boolean
          silence_timeout_seconds?: number
          sip_domain?: string | null
          sip_from_number?: string | null
          sip_password?: string | null
          sip_route_prefix?: string | null
          sip_transport?: string
          sip_username?: string | null
          system_prompt?: string
          temperature?: number
          twilio_number_e164?: string | null
          updated_at?: string
          voice?: string
        }
        Relationships: []
      }
      api_keys: {
        Row: {
          agent_id: string | null
          created_at: string
          id: string
          key_hash: string
          last_used_at: string | null
          name: string
          owner_id: string
          prefix: string
          revoked_at: string | null
          scopes: string[]
          updated_at: string
        }
        Insert: {
          agent_id?: string | null
          created_at?: string
          id?: string
          key_hash: string
          last_used_at?: string | null
          name: string
          owner_id: string
          prefix: string
          revoked_at?: string | null
          scopes?: string[]
          updated_at?: string
        }
        Update: {
          agent_id?: string | null
          created_at?: string
          id?: string
          key_hash?: string
          last_used_at?: string | null
          name?: string
          owner_id?: string
          prefix?: string
          revoked_at?: string | null
          scopes?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          admin_email: string | null
          id: number
          notify_on_errors: boolean
          updated_at: string
        }
        Insert: {
          admin_email?: string | null
          id?: number
          notify_on_errors?: boolean
          updated_at?: string
        }
        Update: {
          admin_email?: string | null
          id?: number
          notify_on_errors?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      calls: {
        Row: {
          agent_id: string | null
          cost_usd: number
          created_at: string
          data_residency: string
          direction: Database["public"]["Enums"]["call_direction"]
          duration_seconds: number
          ended_at: string | null
          external_call_ref: string | null
          from_number: string | null
          handoff_at: string | null
          handoff_to: string | null
          id: string
          input_tokens: number
          metadata: Json
          output_tokens: number
          owner_id: string
          recording_error: string | null
          recording_path: string | null
          recording_status: string | null
          recording_url: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["call_status"]
          summary: string | null
          to_number: string | null
          transcript: Json
          twilio_call_sid: string | null
          updated_at: string
        }
        Insert: {
          agent_id?: string | null
          cost_usd?: number
          created_at?: string
          data_residency?: string
          direction: Database["public"]["Enums"]["call_direction"]
          duration_seconds?: number
          ended_at?: string | null
          external_call_ref?: string | null
          from_number?: string | null
          handoff_at?: string | null
          handoff_to?: string | null
          id?: string
          input_tokens?: number
          metadata?: Json
          output_tokens?: number
          owner_id: string
          recording_error?: string | null
          recording_path?: string | null
          recording_status?: string | null
          recording_url?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["call_status"]
          summary?: string | null
          to_number?: string | null
          transcript?: Json
          twilio_call_sid?: string | null
          updated_at?: string
        }
        Update: {
          agent_id?: string | null
          cost_usd?: number
          created_at?: string
          data_residency?: string
          direction?: Database["public"]["Enums"]["call_direction"]
          duration_seconds?: number
          ended_at?: string | null
          external_call_ref?: string | null
          from_number?: string | null
          handoff_at?: string | null
          handoff_to?: string | null
          id?: string
          input_tokens?: number
          metadata?: Json
          output_tokens?: number
          owner_id?: string
          recording_error?: string | null
          recording_path?: string | null
          recording_status?: string | null
          recording_url?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["call_status"]
          summary?: string | null
          to_number?: string | null
          transcript?: Json
          twilio_call_sid?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calls_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_contacts: {
        Row: {
          attempts: number
          campaign_id: string
          created_at: string
          id: string
          last_call_id: string | null
          metadata: Json
          name: string | null
          owner_id: string
          phone_e164: string
          status: Database["public"]["Enums"]["contact_status"]
        }
        Insert: {
          attempts?: number
          campaign_id: string
          created_at?: string
          id?: string
          last_call_id?: string | null
          metadata?: Json
          name?: string | null
          owner_id: string
          phone_e164: string
          status?: Database["public"]["Enums"]["contact_status"]
        }
        Update: {
          attempts?: number
          campaign_id?: string
          created_at?: string
          id?: string
          last_call_id?: string | null
          metadata?: Json
          name?: string | null
          owner_id?: string
          phone_e164?: string
          status?: Database["public"]["Enums"]["contact_status"]
        }
        Relationships: [
          {
            foreignKeyName: "campaign_contacts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_contacts_last_call_id_fkey"
            columns: ["last_call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          agent_id: string
          call_window_end: string
          call_window_start: string
          completed_contacts: number
          created_at: string
          id: string
          max_concurrent: number
          name: string
          owner_id: string
          scheduled_at: string | null
          status: Database["public"]["Enums"]["campaign_status"]
          timezone: string
          total_contacts: number
          updated_at: string
        }
        Insert: {
          agent_id: string
          call_window_end?: string
          call_window_start?: string
          completed_contacts?: number
          created_at?: string
          id?: string
          max_concurrent?: number
          name: string
          owner_id: string
          scheduled_at?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          timezone?: string
          total_contacts?: number
          updated_at?: string
        }
        Update: {
          agent_id?: string
          call_window_end?: string
          call_window_start?: string
          completed_contacts?: number
          created_at?: string
          id?: string
          max_concurrent?: number
          name?: string
          owner_id?: string
          scheduled_at?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          timezone?: string
          total_contacts?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      data_residency_configs: {
        Row: {
          created_at: string
          enabled: boolean
          gateway_url: string | null
          hmac_secret: string | null
          id: string
          last_ping_at: string | null
          last_ping_error: string | null
          last_ping_ok: boolean | null
          mode: string
          owner_id: string
          proxy_audio: boolean
          purge_twilio_after_ingest: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          gateway_url?: string | null
          hmac_secret?: string | null
          id?: string
          last_ping_at?: string | null
          last_ping_error?: string | null
          last_ping_ok?: boolean | null
          mode?: string
          owner_id: string
          proxy_audio?: boolean
          purge_twilio_after_ingest?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          gateway_url?: string | null
          hmac_secret?: string | null
          id?: string
          last_ping_at?: string | null
          last_ping_error?: string | null
          last_ping_ok?: boolean | null
          mode?: string
          owner_id?: string
          proxy_audio?: boolean
          purge_twilio_after_ingest?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      error_logs: {
        Row: {
          agent_id: string | null
          call_sid: string | null
          context: Json | null
          created_at: string
          id: string
          message: string
          notified: boolean
          owner_id: string | null
          severity: string
          source: string
        }
        Insert: {
          agent_id?: string | null
          call_sid?: string | null
          context?: Json | null
          created_at?: string
          id?: string
          message: string
          notified?: boolean
          owner_id?: string | null
          severity?: string
          source: string
        }
        Update: {
          agent_id?: string | null
          call_sid?: string | null
          context?: Json | null
          created_at?: string
          id?: string
          message?: string
          notified?: boolean
          owner_id?: string | null
          severity?: string
          source?: string
        }
        Relationships: []
      }
      knowledge_chunks: {
        Row: {
          agent_id: string
          chunk_index: number
          content: string
          created_at: string
          document_id: string
          embedding: string | null
          id: string
          owner_id: string
          token_count: number
        }
        Insert: {
          agent_id: string
          chunk_index?: number
          content: string
          created_at?: string
          document_id: string
          embedding?: string | null
          id?: string
          owner_id: string
          token_count?: number
        }
        Update: {
          agent_id?: string
          chunk_index?: number
          content?: string
          created_at?: string
          document_id?: string
          embedding?: string | null
          id?: string
          owner_id?: string
          token_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_chunks_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "knowledge_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_documents: {
        Row: {
          agent_id: string
          chunk_count: number
          created_at: string
          error_message: string | null
          file_name: string
          file_path: string
          id: string
          mime_type: string | null
          owner_id: string
          size_bytes: number
          status: Database["public"]["Enums"]["doc_status"]
          updated_at: string
        }
        Insert: {
          agent_id: string
          chunk_count?: number
          created_at?: string
          error_message?: string | null
          file_name: string
          file_path: string
          id?: string
          mime_type?: string | null
          owner_id: string
          size_bytes?: number
          status?: Database["public"]["Enums"]["doc_status"]
          updated_at?: string
        }
        Update: {
          agent_id?: string
          chunk_count?: number
          created_at?: string
          error_message?: string | null
          file_name?: string
          file_path?: string
          id?: string
          mime_type?: string | null
          owner_id?: string
          size_bytes?: number
          status?: Database["public"]["Enums"]["doc_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_documents_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      twilio_numbers: {
        Row: {
          agent_id: string | null
          capabilities: Json
          created_at: string
          friendly_name: string | null
          id: string
          owner_id: string
          phone_e164: string
          phone_sid: string
          status_callback_url: string | null
          updated_at: string
          voice_webhook_url: string | null
        }
        Insert: {
          agent_id?: string | null
          capabilities?: Json
          created_at?: string
          friendly_name?: string | null
          id?: string
          owner_id: string
          phone_e164: string
          phone_sid: string
          status_callback_url?: string | null
          updated_at?: string
          voice_webhook_url?: string | null
        }
        Update: {
          agent_id?: string | null
          capabilities?: Json
          created_at?: string
          friendly_name?: string | null
          id?: string
          owner_id?: string
          phone_e164?: string
          phone_sid?: string
          status_callback_url?: string | null
          updated_at?: string
          voice_webhook_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "twilio_numbers_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      match_chunks: {
        Args: {
          match_count?: number
          p_agent_id: string
          p_owner_id: string
          query_embedding: string
        }
        Returns: {
          chunk_index: number
          content: string
          document_id: string
          id: string
          similarity: number
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "user"
      call_direction: "inbound" | "outbound"
      call_status:
        | "queued"
        | "ringing"
        | "in_progress"
        | "completed"
        | "failed"
        | "busy"
        | "no_answer"
        | "canceled"
        | "handoff"
      campaign_status:
        | "draft"
        | "scheduled"
        | "running"
        | "paused"
        | "completed"
      contact_status: "pending" | "calling" | "completed" | "failed" | "skipped"
      doc_status: "uploaded" | "processing" | "ready" | "failed"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
      call_direction: ["inbound", "outbound"],
      call_status: [
        "queued",
        "ringing",
        "in_progress",
        "completed",
        "failed",
        "busy",
        "no_answer",
        "canceled",
        "handoff",
      ],
      campaign_status: ["draft", "scheduled", "running", "paused", "completed"],
      contact_status: ["pending", "calling", "completed", "failed", "skipped"],
      doc_status: ["uploaded", "processing", "ready", "failed"],
    },
  },
} as const
