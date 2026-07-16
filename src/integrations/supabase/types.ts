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
          asterisk_ari_app: string | null
          asterisk_ari_base_url: string | null
          asterisk_ari_password: string | null
          asterisk_ari_username: string | null
          asterisk_audiosocket_host: string | null
          asterisk_caller_id: string | null
          asterisk_context: string | null
          asterisk_record_calls: boolean | null
          asterisk_trunk: string | null
          asterisk_webhook_secret: string | null
          created_at: string
          description: string | null
          emotion_tracking_enabled: boolean
          greeting: string
          handoff_dtmf_digit: string | null
          handoff_enabled: boolean
          handoff_numbers: string[]
          handoff_trigger_phrases: string[]
          id: string
          inbound_connection_type: string
          inbound_sip_credential_list_sid: string | null
          inbound_sip_domain: string | null
          inbound_sip_domain_sid: string | null
          inbound_sip_password: string | null
          inbound_sip_slug: string | null
          inbound_sip_uri_user: string | null
          inbound_sip_username: string | null
          is_active: boolean
          language: string
          max_call_seconds: number
          model: string
          name: string
          objection_aaa_enabled: boolean
          objection_categories: string[]
          objection_custom_responses: Json
          objection_handling_enabled: boolean
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
          telegram_bot_id: number | null
          telegram_bot_token: string | null
          telegram_bot_username: string | null
          telephony_provider: string
          temperature: number
          tools_config: Json
          twilio_number_e164: string | null
          updated_at: string
          voice: string
        }
        Insert: {
          asterisk_ari_app?: string | null
          asterisk_ari_base_url?: string | null
          asterisk_ari_password?: string | null
          asterisk_ari_username?: string | null
          asterisk_audiosocket_host?: string | null
          asterisk_caller_id?: string | null
          asterisk_context?: string | null
          asterisk_record_calls?: boolean | null
          asterisk_trunk?: string | null
          asterisk_webhook_secret?: string | null
          created_at?: string
          description?: string | null
          emotion_tracking_enabled?: boolean
          greeting?: string
          handoff_dtmf_digit?: string | null
          handoff_enabled?: boolean
          handoff_numbers?: string[]
          handoff_trigger_phrases?: string[]
          id?: string
          inbound_connection_type?: string
          inbound_sip_credential_list_sid?: string | null
          inbound_sip_domain?: string | null
          inbound_sip_domain_sid?: string | null
          inbound_sip_password?: string | null
          inbound_sip_slug?: string | null
          inbound_sip_uri_user?: string | null
          inbound_sip_username?: string | null
          is_active?: boolean
          language?: string
          max_call_seconds?: number
          model?: string
          name: string
          objection_aaa_enabled?: boolean
          objection_categories?: string[]
          objection_custom_responses?: Json
          objection_handling_enabled?: boolean
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
          telegram_bot_id?: number | null
          telegram_bot_token?: string | null
          telegram_bot_username?: string | null
          telephony_provider?: string
          temperature?: number
          tools_config?: Json
          twilio_number_e164?: string | null
          updated_at?: string
          voice?: string
        }
        Update: {
          asterisk_ari_app?: string | null
          asterisk_ari_base_url?: string | null
          asterisk_ari_password?: string | null
          asterisk_ari_username?: string | null
          asterisk_audiosocket_host?: string | null
          asterisk_caller_id?: string | null
          asterisk_context?: string | null
          asterisk_record_calls?: boolean | null
          asterisk_trunk?: string | null
          asterisk_webhook_secret?: string | null
          created_at?: string
          description?: string | null
          emotion_tracking_enabled?: boolean
          greeting?: string
          handoff_dtmf_digit?: string | null
          handoff_enabled?: boolean
          handoff_numbers?: string[]
          handoff_trigger_phrases?: string[]
          id?: string
          inbound_connection_type?: string
          inbound_sip_credential_list_sid?: string | null
          inbound_sip_domain?: string | null
          inbound_sip_domain_sid?: string | null
          inbound_sip_password?: string | null
          inbound_sip_slug?: string | null
          inbound_sip_uri_user?: string | null
          inbound_sip_username?: string | null
          is_active?: boolean
          language?: string
          max_call_seconds?: number
          model?: string
          name?: string
          objection_aaa_enabled?: boolean
          objection_categories?: string[]
          objection_custom_responses?: Json
          objection_handling_enabled?: boolean
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
          telegram_bot_id?: number | null
          telegram_bot_token?: string | null
          telegram_bot_username?: string | null
          telephony_provider?: string
          temperature?: number
          tools_config?: Json
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
      call_analysis_events: {
        Row: {
          call_id: string
          call_kind: string
          created_at: string
          id: string
          owner_id: string
          primary_signal: string | null
          risk_level: string
          risk_reason: string | null
          risk_score: number
          signals: Json
          suggested_action: string | null
        }
        Insert: {
          call_id: string
          call_kind: string
          created_at?: string
          id?: string
          owner_id: string
          primary_signal?: string | null
          risk_level: string
          risk_reason?: string | null
          risk_score?: number
          signals?: Json
          suggested_action?: string | null
        }
        Update: {
          call_id?: string
          call_kind?: string
          created_at?: string
          id?: string
          owner_id?: string
          primary_signal?: string | null
          risk_level?: string
          risk_reason?: string | null
          risk_score?: number
          signals?: Json
          suggested_action?: string | null
        }
        Relationships: []
      }
      calls: {
        Row: {
          agent_id: string | null
          analyzed_at: string | null
          competitor_mentioned: boolean
          competitor_names: string[]
          complaint_flag: boolean
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
          primary_signal: string | null
          recording_error: string | null
          recording_path: string | null
          recording_status: string | null
          recording_url: string | null
          risk_level: string
          risk_reason: string | null
          risk_score: number
          risk_updated_at: string | null
          sentiment: string | null
          sentiment_score: number | null
          source: string
          started_at: string | null
          status: Database["public"]["Enums"]["call_status"]
          suggested_action: string | null
          summary: string | null
          to_number: string | null
          topics: string[]
          transcript: Json
          twilio_call_sid: string | null
          updated_at: string
        }
        Insert: {
          agent_id?: string | null
          analyzed_at?: string | null
          competitor_mentioned?: boolean
          competitor_names?: string[]
          complaint_flag?: boolean
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
          primary_signal?: string | null
          recording_error?: string | null
          recording_path?: string | null
          recording_status?: string | null
          recording_url?: string | null
          risk_level?: string
          risk_reason?: string | null
          risk_score?: number
          risk_updated_at?: string | null
          sentiment?: string | null
          sentiment_score?: number | null
          source?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["call_status"]
          suggested_action?: string | null
          summary?: string | null
          to_number?: string | null
          topics?: string[]
          transcript?: Json
          twilio_call_sid?: string | null
          updated_at?: string
        }
        Update: {
          agent_id?: string | null
          analyzed_at?: string | null
          competitor_mentioned?: boolean
          competitor_names?: string[]
          complaint_flag?: boolean
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
          primary_signal?: string | null
          recording_error?: string | null
          recording_path?: string | null
          recording_status?: string | null
          recording_url?: string | null
          risk_level?: string
          risk_reason?: string | null
          risk_score?: number
          risk_updated_at?: string | null
          sentiment?: string | null
          sentiment_score?: number | null
          source?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["call_status"]
          suggested_action?: string | null
          summary?: string | null
          to_number?: string | null
          topics?: string[]
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
      compliance_rules: {
        Row: {
          active: boolean
          correction: string | null
          created_at: string
          id: string
          kind: string
          owner_id: string
          text: string
          trigger_phrases: string[] | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          correction?: string | null
          created_at?: string
          id?: string
          kind: string
          owner_id?: string
          text: string
          trigger_phrases?: string[] | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          correction?: string | null
          created_at?: string
          id?: string
          kind?: string
          owner_id?: string
          text?: string
          trigger_phrases?: string[] | null
          updated_at?: string
        }
        Relationships: []
      }
      copilot_agents: {
        Row: {
          channel_binding: string | null
          competitor_context: string | null
          created_at: string
          description: string | null
          emotion_tracking_enabled: boolean
          enabled: boolean
          id: string
          knowledge_hint: string | null
          language: string
          min_suggestion_interval_ms: number
          name: string
          objection_handling_enabled: boolean
          owner_id: string
          pricing_context: string | null
          product_context: string | null
          suggestion_categories: Json
          system_prompt: string
          twilio_number_id: string | null
          updated_at: string
        }
        Insert: {
          channel_binding?: string | null
          competitor_context?: string | null
          created_at?: string
          description?: string | null
          emotion_tracking_enabled?: boolean
          enabled?: boolean
          id?: string
          knowledge_hint?: string | null
          language?: string
          min_suggestion_interval_ms?: number
          name: string
          objection_handling_enabled?: boolean
          owner_id: string
          pricing_context?: string | null
          product_context?: string | null
          suggestion_categories?: Json
          system_prompt?: string
          twilio_number_id?: string | null
          updated_at?: string
        }
        Update: {
          channel_binding?: string | null
          competitor_context?: string | null
          created_at?: string
          description?: string | null
          emotion_tracking_enabled?: boolean
          enabled?: boolean
          id?: string
          knowledge_hint?: string | null
          language?: string
          min_suggestion_interval_ms?: number
          name?: string
          objection_handling_enabled?: boolean
          owner_id?: string
          pricing_context?: string | null
          product_context?: string | null
          suggestion_categories?: Json
          system_prompt?: string
          twilio_number_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "copilot_agents_twilio_number_id_fkey"
            columns: ["twilio_number_id"]
            isOneToOne: false
            referencedRelation: "twilio_numbers"
            referencedColumns: ["id"]
          },
        ]
      }
      copilot_sessions: {
        Row: {
          agent_id: string
          call_sid: string | null
          channel_id: string | null
          created_at: string
          customer_phone: string | null
          ended_at: string | null
          id: string
          is_test: boolean
          manager_id: string | null
          manager_name: string | null
          metrics: Json
          owner_id: string
          primary_signal: string | null
          recording_url: string | null
          risk_level: string
          risk_reason: string | null
          risk_score: number
          risk_updated_at: string | null
          sentiment: string | null
          source: string
          started_at: string
          status: string
          suggested_action: string | null
          summary: string | null
          summary_data: Json | null
          transcript_url: string | null
          updated_at: string
        }
        Insert: {
          agent_id: string
          call_sid?: string | null
          channel_id?: string | null
          created_at?: string
          customer_phone?: string | null
          ended_at?: string | null
          id?: string
          is_test?: boolean
          manager_id?: string | null
          manager_name?: string | null
          metrics?: Json
          owner_id: string
          primary_signal?: string | null
          recording_url?: string | null
          risk_level?: string
          risk_reason?: string | null
          risk_score?: number
          risk_updated_at?: string | null
          sentiment?: string | null
          source?: string
          started_at?: string
          status?: string
          suggested_action?: string | null
          summary?: string | null
          summary_data?: Json | null
          transcript_url?: string | null
          updated_at?: string
        }
        Update: {
          agent_id?: string
          call_sid?: string | null
          channel_id?: string | null
          created_at?: string
          customer_phone?: string | null
          ended_at?: string | null
          id?: string
          is_test?: boolean
          manager_id?: string | null
          manager_name?: string | null
          metrics?: Json
          owner_id?: string
          primary_signal?: string | null
          recording_url?: string | null
          risk_level?: string
          risk_reason?: string | null
          risk_score?: number
          risk_updated_at?: string | null
          sentiment?: string | null
          source?: string
          started_at?: string
          status?: string
          suggested_action?: string | null
          summary?: string | null
          summary_data?: Json | null
          transcript_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "copilot_sessions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "copilot_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      copilot_suggestions: {
        Row: {
          acknowledged: boolean
          category: string | null
          created_at: string
          emotion: string | null
          id: string
          metadata: Json
          owner_id: string
          priority: string
          rationale: string | null
          session_id: string
          speaker: string | null
          suggestion_text: string
          trigger_quote: string | null
          ts: string
          used: boolean
        }
        Insert: {
          acknowledged?: boolean
          category?: string | null
          created_at?: string
          emotion?: string | null
          id?: string
          metadata?: Json
          owner_id: string
          priority?: string
          rationale?: string | null
          session_id: string
          speaker?: string | null
          suggestion_text: string
          trigger_quote?: string | null
          ts?: string
          used?: boolean
        }
        Update: {
          acknowledged?: boolean
          category?: string | null
          created_at?: string
          emotion?: string | null
          id?: string
          metadata?: Json
          owner_id?: string
          priority?: string
          rationale?: string | null
          session_id?: string
          speaker?: string | null
          suggestion_text?: string
          trigger_quote?: string | null
          ts?: string
          used?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "copilot_suggestions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "copilot_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      copilot_transcript: {
        Row: {
          created_at: string
          id: string
          owner_id: string
          session_id: string
          speaker: string
          text: string
          ts: string
        }
        Insert: {
          created_at?: string
          id?: string
          owner_id: string
          session_id: string
          speaker: string
          text: string
          ts?: string
        }
        Update: {
          created_at?: string
          id?: string
          owner_id?: string
          session_id?: string
          speaker?: string
          text?: string
          ts?: string
        }
        Relationships: [
          {
            foreignKeyName: "copilot_transcript_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "copilot_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_health: {
        Row: {
          breaker_open_until: string | null
          consecutive_failures: number
          crm_id: string
          is_up: boolean | null
          last_check_at: string | null
          last_check_latency_ms: number | null
          last_error: string | null
          last_failure_at: string | null
          last_success_at: string | null
          owner_id: string
          updated_at: string
        }
        Insert: {
          breaker_open_until?: string | null
          consecutive_failures?: number
          crm_id: string
          is_up?: boolean | null
          last_check_at?: string | null
          last_check_latency_ms?: number | null
          last_error?: string | null
          last_failure_at?: string | null
          last_success_at?: string | null
          owner_id: string
          updated_at?: string
        }
        Update: {
          breaker_open_until?: string | null
          consecutive_failures?: number
          crm_id?: string
          is_up?: boolean | null
          last_check_at?: string | null
          last_check_latency_ms?: number | null
          last_error?: string | null
          last_failure_at?: string | null
          last_success_at?: string | null
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      data_residency_configs: {
        Row: {
          created_at: string
          crm_auth_header: string
          crm_auth_value: string
          crm_enabled: boolean
          crm_object1_label: string
          crm_object2_label: string
          crm_object3_label: string
          crm_timeout_ms: number
          crm_tool_description: string
          crm_url: string | null
          crm2_enabled: boolean
          crm2_system_prompt_template: string | null
          crm2_timeout_ms: number
          crm2_url: string | null
          crm2_url_backup: string | null
          enabled: boolean
          gateway_url: string | null
          gdpr_contact_email: string | null
          hmac_secret: string | null
          id: string
          last_full_sync_at: string | null
          last_ping_at: string | null
          last_ping_error: string | null
          last_ping_ok: boolean | null
          mode: string
          notify_on_escalation: boolean
          owner_id: string
          proxy_audio: boolean
          purge_twilio_after_ingest: boolean
          retention_days: number
          supervisor_telegram_bot_token: string | null
          supervisor_telegram_chat_id: string | null
          sync_agents: boolean
          sync_knowledge: boolean
          sync_transcripts: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          crm_auth_header?: string
          crm_auth_value?: string
          crm_enabled?: boolean
          crm_object1_label?: string
          crm_object2_label?: string
          crm_object3_label?: string
          crm_timeout_ms?: number
          crm_tool_description?: string
          crm_url?: string | null
          crm2_enabled?: boolean
          crm2_system_prompt_template?: string | null
          crm2_timeout_ms?: number
          crm2_url?: string | null
          crm2_url_backup?: string | null
          enabled?: boolean
          gateway_url?: string | null
          gdpr_contact_email?: string | null
          hmac_secret?: string | null
          id?: string
          last_full_sync_at?: string | null
          last_ping_at?: string | null
          last_ping_error?: string | null
          last_ping_ok?: boolean | null
          mode?: string
          notify_on_escalation?: boolean
          owner_id: string
          proxy_audio?: boolean
          purge_twilio_after_ingest?: boolean
          retention_days?: number
          supervisor_telegram_bot_token?: string | null
          supervisor_telegram_chat_id?: string | null
          sync_agents?: boolean
          sync_knowledge?: boolean
          sync_transcripts?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          crm_auth_header?: string
          crm_auth_value?: string
          crm_enabled?: boolean
          crm_object1_label?: string
          crm_object2_label?: string
          crm_object3_label?: string
          crm_timeout_ms?: number
          crm_tool_description?: string
          crm_url?: string | null
          crm2_enabled?: boolean
          crm2_system_prompt_template?: string | null
          crm2_timeout_ms?: number
          crm2_url?: string | null
          crm2_url_backup?: string | null
          enabled?: boolean
          gateway_url?: string | null
          gdpr_contact_email?: string | null
          hmac_secret?: string | null
          id?: string
          last_full_sync_at?: string | null
          last_ping_at?: string | null
          last_ping_error?: string | null
          last_ping_ok?: boolean | null
          mode?: string
          notify_on_escalation?: boolean
          owner_id?: string
          proxy_audio?: boolean
          purge_twilio_after_ingest?: boolean
          retention_days?: number
          supervisor_telegram_bot_token?: string | null
          supervisor_telegram_chat_id?: string | null
          sync_agents?: boolean
          sync_knowledge?: boolean
          sync_transcripts?: boolean
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
      gdpr_dsr_requests: {
        Row: {
          completed_at: string | null
          created_at: string
          error: string | null
          id: string
          kind: string
          owner_id: string
          result: Json | null
          scope: Json
          status: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          kind: string
          owner_id: string
          result?: Json | null
          scope?: Json
          status?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          kind?: string
          owner_id?: string
          result?: Json | null
          scope?: Json
          status?: string
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
      objection_events: {
        Row: {
          agent_id: string | null
          ai_response: string | null
          call_sid: string | null
          channel: string
          created_at: string
          customer_emotion: string | null
          id: string
          objection_type: string
          outcome: string
          owner_id: string
          raw_quote: string | null
          strategy_used: string | null
        }
        Insert: {
          agent_id?: string | null
          ai_response?: string | null
          call_sid?: string | null
          channel?: string
          created_at?: string
          customer_emotion?: string | null
          id?: string
          objection_type: string
          outcome?: string
          owner_id: string
          raw_quote?: string | null
          strategy_used?: string | null
        }
        Update: {
          agent_id?: string | null
          ai_response?: string | null
          call_sid?: string | null
          channel?: string
          created_at?: string
          customer_emotion?: string | null
          id?: string
          objection_type?: string
          outcome?: string
          owner_id?: string
          raw_quote?: string | null
          strategy_used?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "objection_events_agent_id_fkey"
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
      ticket_sla_snapshots: {
        Row: {
          breaker_open: boolean
          bucket_hour: string
          created_at: string
          escalated: number
          failed: number
          id: string
          owner_id: string
          p95_latency_ms: number | null
          pending: number
          success: number
          success_rate: number | null
          total: number
        }
        Insert: {
          breaker_open?: boolean
          bucket_hour: string
          created_at?: string
          escalated?: number
          failed?: number
          id?: string
          owner_id: string
          p95_latency_ms?: number | null
          pending?: number
          success?: number
          success_rate?: number | null
          total?: number
        }
        Update: {
          breaker_open?: boolean
          bucket_hour?: string
          created_at?: string
          escalated?: number
          failed?: number
          id?: string
          owner_id?: string
          p95_latency_ms?: number | null
          pending?: number
          success?: number
          success_rate?: number | null
          total?: number
        }
        Relationships: []
      }
      tickets: {
        Row: {
          agent_id: string | null
          attempts: number
          call_id: string | null
          call_sid: string | null
          caller_comment: string | null
          created_at: string
          crm_id: string
          emergency_type: string | null
          escalated_at: string | null
          escalation_reason: string | null
          external_status: string | null
          external_ticket_id: string | null
          facility_address: string | null
          id: string
          idempotency_key: string | null
          last_error: string | null
          latency_ms: number | null
          max_attempts: number
          next_retry_at: string | null
          nlc_number: string | null
          notified_at: string | null
          owner_id: string
          payload: Json
          phone_number: string | null
          response: Json | null
          status: string
          updated_at: string
        }
        Insert: {
          agent_id?: string | null
          attempts?: number
          call_id?: string | null
          call_sid?: string | null
          caller_comment?: string | null
          created_at?: string
          crm_id?: string
          emergency_type?: string | null
          escalated_at?: string | null
          escalation_reason?: string | null
          external_status?: string | null
          external_ticket_id?: string | null
          facility_address?: string | null
          id?: string
          idempotency_key?: string | null
          last_error?: string | null
          latency_ms?: number | null
          max_attempts?: number
          next_retry_at?: string | null
          nlc_number?: string | null
          notified_at?: string | null
          owner_id: string
          payload?: Json
          phone_number?: string | null
          response?: Json | null
          status?: string
          updated_at?: string
        }
        Update: {
          agent_id?: string | null
          attempts?: number
          call_id?: string | null
          call_sid?: string | null
          caller_comment?: string | null
          created_at?: string
          crm_id?: string
          emergency_type?: string | null
          escalated_at?: string | null
          escalation_reason?: string | null
          external_status?: string | null
          external_ticket_id?: string | null
          facility_address?: string | null
          id?: string
          idempotency_key?: string | null
          last_error?: string | null
          latency_ms?: number | null
          max_attempts?: number
          next_retry_at?: string | null
          nlc_number?: string | null
          notified_at?: string | null
          owner_id?: string
          payload?: Json
          phone_number?: string | null
          response?: Json | null
          status?: string
          updated_at?: string
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
      whispers: {
        Row: {
          call_id: string
          call_kind: string
          created_at: string
          id: string
          owner_id: string
          read_at: string | null
          sender_id: string | null
          text: string
        }
        Insert: {
          call_id: string
          call_kind?: string
          created_at?: string
          id?: string
          owner_id: string
          read_at?: string | null
          sender_id?: string | null
          text: string
        }
        Update: {
          call_id?: string
          call_kind?: string
          created_at?: string
          id?: string
          owner_id?: string
          read_at?: string | null
          sender_id?: string | null
          text?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_list_cron_jobs: {
        Args: never
        Returns: {
          active: boolean
          command: string
          database: string
          jobid: number
          jobname: string
          schedule: string
          username: string
        }[]
      }
      admin_list_cron_runs: {
        Args: { _limit?: number }
        Returns: {
          command: string
          database: string
          end_time: string
          job_pid: number
          jobid: number
          return_message: string
          runid: number
          start_time: string
          status: string
          username: string
        }[]
      }
      admin_set_cron_active: {
        Args: { _active: boolean; _jobid: number }
        Returns: boolean
      }
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
      purge_expired_cloud_data: {
        Args: never
        Returns: {
          calls_deleted: number
          copilot_sessions_deleted: number
          owner_id: string
          transcript_deleted: number
        }[]
      }
      update_ticket_from_webhook: {
        Args: {
          _external_ticket_id: string
          _owner_id: string
          _payload: Json
          _status: string
        }
        Returns: string
      }
    }
    Enums: {
      app_role: "admin" | "user" | "supervisor"
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
      app_role: ["admin", "user", "supervisor"],
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
