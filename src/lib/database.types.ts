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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      couple_invites: {
        Row: {
          couple_id: string
          created_at: string
          created_by: string
          expires_at: string
          id: string
          token_hash: string
          used_at: string | null
        }
        Insert: {
          couple_id: string
          created_at?: string
          created_by: string
          expires_at: string
          id?: string
          token_hash: string
          used_at?: string | null
        }
        Update: {
          couple_id?: string
          created_at?: string
          created_by?: string
          expires_at?: string
          id?: string
          token_hash?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "couple_invites_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
        ]
      }
      couple_members: {
        Row: {
          couple_id: string
          joined_at: string
          role: string
          user_id: string
        }
        Insert: {
          couple_id: string
          joined_at?: string
          role: string
          user_id: string
        }
        Update: {
          couple_id?: string
          joined_at?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "couple_members_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
        ]
      }
      couples: {
        Row: {
          created_at: string
          created_by: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          name?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      date_catalog: {
        Row: {
          accessibility: Json
          active: boolean
          category: string
          consent: Json
          created_at: string
          description: string
          duration_minutes: number
          energy: string
          enjoyment_tips: string
          id: string
          low_energy_alternative: string
          materials: Json
          objective: string
          preparation: string
          prompts: Json
          setting: string
          sort_order: number
          steps: Json
          title: string
        }
        Insert: {
          accessibility?: Json
          active?: boolean
          category: string
          consent?: Json
          created_at?: string
          description: string
          duration_minutes: number
          energy: string
          enjoyment_tips?: string
          id: string
          low_energy_alternative: string
          materials?: Json
          objective?: string
          preparation: string
          prompts: Json
          setting: string
          sort_order: number
          steps?: Json
          title: string
        }
        Update: {
          accessibility?: Json
          active?: boolean
          category?: string
          consent?: Json
          created_at?: string
          description?: string
          duration_minutes?: number
          energy?: string
          enjoyment_tips?: string
          id?: string
          low_energy_alternative?: string
          materials?: Json
          objective?: string
          preparation?: string
          prompts?: Json
          setting?: string
          sort_order?: number
          steps?: Json
          title?: string
        }
        Relationships: []
      }
      date_confirmations: {
        Row: {
          confirmed_at: string
          recommendation_id: string
          session_id: string
          user_id: string
        }
        Insert: {
          confirmed_at?: string
          recommendation_id: string
          session_id: string
          user_id: string
        }
        Update: {
          confirmed_at?: string
          recommendation_id?: string
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "date_confirmations_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "date_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "date_confirmations_session_id_recommendation_id_fkey"
            columns: ["session_id", "recommendation_id"]
            isOneToOne: false
            referencedRelation: "date_recommendations"
            referencedColumns: ["session_id", "id"]
          },
        ]
      }
      date_experience_confirmations: {
        Row: {
          confirmed_at: string
          session_id: string
          user_id: string
        }
        Insert: {
          confirmed_at?: string
          session_id: string
          user_id: string
        }
        Update: {
          confirmed_at?: string
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "date_experience_confirmations_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "date_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      date_experience_progress: {
        Row: {
          completed_steps: number[]
          couple_id: string
          question_index: number
          question_level: string
          session_id: string
          skipped_steps: number[]
          turn_user_id: string
          updated_at: string
        }
        Insert: {
          completed_steps?: number[]
          couple_id: string
          question_index?: number
          question_level?: string
          session_id: string
          skipped_steps?: number[]
          turn_user_id: string
          updated_at?: string
        }
        Update: {
          completed_steps?: number[]
          couple_id?: string
          question_index?: number
          question_level?: string
          session_id?: string
          skipped_steps?: number[]
          turn_user_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "date_experience_progress_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "date_experience_progress_couple_session_fk"
            columns: ["couple_id", "session_id"]
            isOneToOne: false
            referencedRelation: "date_sessions"
            referencedColumns: ["couple_id", "id"]
          },
          {
            foreignKeyName: "date_experience_progress_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: true
            referencedRelation: "date_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      date_memories: {
        Row: {
          couple_id: string
          created_at: string
          created_by: string
          description: string | null
          favorite_part: string | null
          happened_on: string | null
          id: string
          session_id: string | null
          song: string | null
          title: string
          updated_at: string
        }
        Insert: {
          couple_id: string
          created_at?: string
          created_by: string
          description?: string | null
          favorite_part?: string | null
          happened_on?: string | null
          id?: string
          session_id?: string | null
          song?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          couple_id?: string
          created_at?: string
          created_by?: string
          description?: string | null
          favorite_part?: string | null
          happened_on?: string | null
          id?: string
          session_id?: string | null
          song?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "date_memories_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "date_memories_couple_id_session_id_fkey"
            columns: ["couple_id", "session_id"]
            isOneToOne: false
            referencedRelation: "date_sessions"
            referencedColumns: ["couple_id", "id"]
          },
          {
            foreignKeyName: "date_memories_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "date_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      date_memory_confirmations: {
        Row: {
          confirmed_at: string
          memory_id: string
          user_id: string
        }
        Insert: {
          confirmed_at?: string
          memory_id: string
          user_id: string
        }
        Update: {
          confirmed_at?: string
          memory_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "date_memory_confirmations_memory_id_fkey"
            columns: ["memory_id"]
            isOneToOne: false
            referencedRelation: "date_memories"
            referencedColumns: ["id"]
          },
        ]
      }
      date_memory_contributions: {
        Row: {
          created_at: string
          description: string | null
          favorite_part: string | null
          id: string
          is_shared_note_copy: boolean
          memory_id: string
          song: string | null
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          favorite_part?: string | null
          id?: string
          is_shared_note_copy?: boolean
          memory_id: string
          song?: string | null
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          favorite_part?: string | null
          id?: string
          is_shared_note_copy?: boolean
          memory_id?: string
          song?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "date_memory_contributions_memory_id_fkey"
            columns: ["memory_id"]
            isOneToOne: false
            referencedRelation: "date_memories"
            referencedColumns: ["id"]
          },
        ]
      }
      date_prompt_favorites: {
        Row: {
          created_at: string
          prompt_key: string
          session_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          prompt_key: string
          session_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          prompt_key?: string
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "date_prompt_favorites_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "date_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      date_recommendations: {
        Row: {
          created_at: string
          date_id: string
          explanation: string
          id: string
          position: number
          preparation: string
          prompts: Json
          session_id: string
          surprise: string | null
        }
        Insert: {
          created_at?: string
          date_id: string
          explanation: string
          id?: string
          position: number
          preparation: string
          prompts?: Json
          session_id: string
          surprise?: string | null
        }
        Update: {
          created_at?: string
          date_id?: string
          explanation?: string
          id?: string
          position?: number
          preparation?: string
          prompts?: Json
          session_id?: string
          surprise?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "date_recommendations_date_id_fkey"
            columns: ["date_id"]
            isOneToOne: false
            referencedRelation: "date_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "date_recommendations_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "date_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      date_response_status: {
        Row: {
          session_id: string
          submitted_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          session_id: string
          submitted_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          session_id?: string
          submitted_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "date_response_status_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "date_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      date_responses: {
        Row: {
          answers: Json
          session_id: string
          submitted_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          answers?: Json
          session_id: string
          submitted_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          answers?: Json
          session_id?: string
          submitted_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "date_responses_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "date_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      date_sessions: {
        Row: {
          couple_id: string
          created_at: string
          created_by: string
          id: string
          scheduled_for: string | null
          selected_date_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          couple_id: string
          created_at?: string
          created_by: string
          id?: string
          scheduled_for?: string | null
          selected_date_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          couple_id?: string
          created_at?: string
          created_by?: string
          id?: string
          scheduled_for?: string | null
          selected_date_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "date_sessions_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "date_sessions_selected_date_id_fkey"
            columns: ["selected_date_id"]
            isOneToOne: false
            referencedRelation: "date_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      date_votes: {
        Row: {
          recommendation_id: string
          session_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          recommendation_id: string
          session_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          recommendation_id?: string
          session_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "date_votes_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "date_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "date_votes_session_id_recommendation_id_fkey"
            columns: ["session_id", "recommendation_id"]
            isOneToOne: false
            referencedRelation: "date_recommendations"
            referencedColumns: ["session_id", "id"]
          },
        ]
      }
      favorites: {
        Row: {
          couple_id: string
          created_at: string
          date_id: string
          user_id: string
        }
        Insert: {
          couple_id: string
          created_at?: string
          date_id: string
          user_id: string
        }
        Update: {
          couple_id?: string
          created_at?: string
          date_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_date_id_fkey"
            columns: ["date_id"]
            isOneToOne: false
            referencedRelation: "date_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      memory_photos: {
        Row: {
          byte_size: number
          created_at: string
          id: string
          memory_id: string
          mime_type: string
          object_path: string
          uploaded_by: string
        }
        Insert: {
          byte_size: number
          created_at?: string
          id?: string
          memory_id: string
          mime_type: string
          object_path: string
          uploaded_by: string
        }
        Update: {
          byte_size?: number
          created_at?: string
          id?: string
          memory_id?: string
          mime_type?: string
          object_path?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "memory_photos_memory_id_fkey"
            columns: ["memory_id"]
            isOneToOne: false
            referencedRelation: "date_memories"
            referencedColumns: ["id"]
          },
        ]
      }
      private_notes: {
        Row: {
          body: string
          couple_id: string
          created_at: string
          id: string
          session_id: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body: string
          couple_id: string
          created_at?: string
          id?: string
          session_id?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string
          couple_id?: string
          created_at?: string
          id?: string
          session_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "private_notes_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "private_notes_session_couple_fk"
            columns: ["couple_id", "session_id"]
            isOneToOne: false
            referencedRelation: "date_sessions"
            referencedColumns: ["couple_id", "id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_couple_invite: { Args: { p_token: string }; Returns: string }
      advance_date_experience_turn: {
        Args: { p_session_id: string }
        Returns: undefined
      }
      can_upload_memory_photo: {
        Args: { p_memory_id: string; p_object_name: string }
        Returns: boolean
      }
      close_date_session: {
        Args: { p_session_id: string; p_status: string }
        Returns: undefined
      }
      confirm_date_recommendation: {
        Args: { p_session_id: string }
        Returns: boolean
      }
      create_couple: { Args: never; Returns: string }
      create_couple_invite: { Args: never; Returns: string }
      create_date_memory: {
        Args: { p_happened_on: string; p_session_id: string; p_title: string }
        Returns: string
      }
      delete_memory_photo: { Args: { p_photo_id: string }; Returns: string }
      finish_date_experience: {
        Args: { p_session_id: string }
        Returns: boolean
      }
      generate_date_recommendations: {
        Args: { p_session_id: string }
        Returns: Json
      }
      is_couple_member: { Args: { target_couple: string }; Returns: boolean }
      register_memory_photo: {
        Args: {
          p_byte_size: number
          p_memory_id: string
          p_mime_type: string
          p_object_path: string
        }
        Returns: string
      }
      save_date_response: {
        Args: { p_answers: Json; p_session_id: string; p_submit?: boolean }
        Returns: Json
      }
      set_date_experience_question: {
        Args: { p_index: number; p_level: string; p_session_id: string }
        Returns: undefined
      }
      share_private_note_to_memory: {
        Args: { p_memory_id: string; p_note_id: string }
        Returns: string
      }
      start_date_experience: {
        Args: { p_session_id: string }
        Returns: undefined
      }
      start_or_resume_date_session: {
        Args: { p_couple_id: string }
        Returns: string
      }
      update_date_experience_step: {
        Args: { p_action: string; p_session_id: string; p_step: number }
        Returns: undefined
      }
      update_date_memory_metadata: {
        Args: {
          p_expected_updated_at: string
          p_happened_on: string
          p_memory_id: string
          p_title: string
        }
        Returns: string
      }
      vote_date_recommendation: {
        Args: { p_recommendation_id: string; p_session_id: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
