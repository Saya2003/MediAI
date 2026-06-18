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
      appointments: {
        Row: {
          case_id: string
          created_at: string
          id: string
          location: string | null
          scheduled_at: string | null
          specialist_id: string | null
          specialist_name: string
          status: Database["public"]["Enums"]["appointment_status"]
        }
        Insert: {
          case_id: string
          created_at?: string
          id?: string
          location?: string | null
          scheduled_at?: string | null
          specialist_id?: string | null
          specialist_name: string
          status?: Database["public"]["Enums"]["appointment_status"]
        }
        Update: {
          case_id?: string
          created_at?: string
          id?: string
          location?: string | null
          scheduled_at?: string | null
          specialist_id?: string | null
          specialist_name?: string
          status?: Database["public"]["Enums"]["appointment_status"]
        }
        Relationships: [
          {
            foreignKeyName: "appointments_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      case_events: {
        Row: {
          actor_label: string
          actor_type: Database["public"]["Enums"]["actor_type"]
          case_id: string
          created_at: string
          details: Json | null
          event_type: string
          id: string
        }
        Insert: {
          actor_label: string
          actor_type?: Database["public"]["Enums"]["actor_type"]
          case_id: string
          created_at?: string
          details?: Json | null
          event_type: string
          id?: string
        }
        Update: {
          actor_label?: string
          actor_type?: Database["public"]["Enums"]["actor_type"]
          case_id?: string
          created_at?: string
          details?: Json | null
          event_type?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_events_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      cases: {
        Row: {
          case_number: string
          closed_at: string | null
          created_at: string
          id: string
          mrn: string
          patient_dob: string | null
          patient_name: string
          priority: Database["public"]["Enums"]["case_priority"]
          referring_physician_id: string | null
          referring_physician_name: string | null
          sla_due_at: string | null
          specialty: string
          stage: Database["public"]["Enums"]["case_stage"]
          updated_at: string
        }
        Insert: {
          case_number?: string
          closed_at?: string | null
          created_at?: string
          id?: string
          mrn: string
          patient_dob?: string | null
          patient_name: string
          priority?: Database["public"]["Enums"]["case_priority"]
          referring_physician_id?: string | null
          referring_physician_name?: string | null
          sla_due_at?: string | null
          specialty: string
          stage?: Database["public"]["Enums"]["case_stage"]
          updated_at?: string
        }
        Update: {
          case_number?: string
          closed_at?: string | null
          created_at?: string
          id?: string
          mrn?: string
          patient_dob?: string | null
          patient_name?: string
          priority?: Database["public"]["Enums"]["case_priority"]
          referring_physician_id?: string | null
          referring_physician_name?: string | null
          sla_due_at?: string | null
          specialty?: string
          stage?: Database["public"]["Enums"]["case_stage"]
          updated_at?: string
        }
        Relationships: []
      }
      follow_ups: {
        Row: {
          case_id: string
          id: string
          next_action: string | null
          outcome_notes: string | null
          recorded_at: string
        }
        Insert: {
          case_id: string
          id?: string
          next_action?: string | null
          outcome_notes?: string | null
          recorded_at?: string
        }
        Update: {
          case_id?: string
          id?: string
          next_action?: string | null
          outcome_notes?: string | null
          recorded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "follow_ups_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          case_id: string | null
          created_at: string
          id: string
          message: string
          read_at: string | null
          user_id: string
        }
        Insert: {
          case_id?: string | null
          created_at?: string
          id?: string
          message: string
          read_at?: string | null
          user_id: string
        }
        Update: {
          case_id?: string | null
          created_at?: string
          id?: string
          message?: string
          read_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      pre_authorizations: {
        Row: {
          case_id: string
          created_at: string
          decided_at: string | null
          denial_reason: string | null
          id: string
          payer: string | null
          status: Database["public"]["Enums"]["preauth_status"]
        }
        Insert: {
          case_id: string
          created_at?: string
          decided_at?: string | null
          denial_reason?: string | null
          id?: string
          payer?: string | null
          status?: Database["public"]["Enums"]["preauth_status"]
        }
        Update: {
          case_id?: string
          created_at?: string
          decided_at?: string | null
          denial_reason?: string | null
          id?: string
          payer?: string | null
          status?: Database["public"]["Enums"]["preauth_status"]
        }
        Relationships: [
          {
            foreignKeyName: "pre_authorizations_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          organization: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          organization?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          organization?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      referrals: {
        Row: {
          case_id: string
          clinical_notes: string | null
          created_at: string
          diagnosis_code: string | null
          diagnosis_description: string | null
          document_url: string | null
          id: string
        }
        Insert: {
          case_id: string
          clinical_notes?: string | null
          created_at?: string
          diagnosis_code?: string | null
          diagnosis_description?: string | null
          document_url?: string | null
          id?: string
        }
        Update: {
          case_id?: string
          clinical_notes?: string | null
          created_at?: string
          diagnosis_code?: string | null
          diagnosis_description?: string | null
          document_url?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "referrals_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assignee_role: Database["public"]["Enums"]["app_role"]
          assignee_user_id: string | null
          case_id: string
          completed_at: string | null
          created_at: string
          description: string | null
          id: string
          kind: Database["public"]["Enums"]["task_kind"]
          payload: Json | null
          sla_due_at: string | null
          status: Database["public"]["Enums"]["task_status"]
          title: string
        }
        Insert: {
          assignee_role?: Database["public"]["Enums"]["app_role"]
          assignee_user_id?: string | null
          case_id: string
          completed_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          kind: Database["public"]["Enums"]["task_kind"]
          payload?: Json | null
          sla_due_at?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title: string
        }
        Update: {
          assignee_role?: Database["public"]["Enums"]["app_role"]
          assignee_user_id?: string | null
          case_id?: string
          completed_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["task_kind"]
          payload?: Json | null
          sla_due_at?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
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
          role: Database["public"]["Enums"]["app_role"]
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
      current_user_has_any_role: {
        Args: { _roles: Database["public"]["Enums"]["app_role"][] }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      actor_type: "human" | "rpa" | "ai_agent" | "system"
      app_role: "coordinator" | "physician" | "specialist" | "supervisor"
      appointment_status:
        | "proposed"
        | "confirmed"
        | "completed"
        | "cancelled"
        | "no_show"
      case_priority: "routine" | "urgent" | "stat"
      case_stage:
        | "intake"
        | "pre_auth"
        | "scheduling"
        | "appointment"
        | "follow_up"
        | "closed"
        | "cancelled"
      preauth_status: "pending" | "approved" | "denied" | "appealing"
      task_kind:
        | "verify_insurance"
        | "review_preauth"
        | "select_specialist"
        | "confirm_slot"
        | "record_outcome"
        | "escalate"
        | "schedule_follow_up"
      task_status:
        | "open"
        | "in_progress"
        | "completed"
        | "escalated"
        | "cancelled"
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
      actor_type: ["human", "rpa", "ai_agent", "system"],
      app_role: ["coordinator", "physician", "specialist", "supervisor"],
      appointment_status: [
        "proposed",
        "confirmed",
        "completed",
        "cancelled",
        "no_show",
      ],
      case_priority: ["routine", "urgent", "stat"],
      case_stage: [
        "intake",
        "pre_auth",
        "scheduling",
        "appointment",
        "follow_up",
        "closed",
        "cancelled",
      ],
      preauth_status: ["pending", "approved", "denied", "appealing"],
      task_kind: [
        "verify_insurance",
        "review_preauth",
        "select_specialist",
        "confirm_slot",
        "record_outcome",
        "escalate",
        "schedule_follow_up",
      ],
      task_status: [
        "open",
        "in_progress",
        "completed",
        "escalated",
        "cancelled",
      ],
    },
  },
} as const
