export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      coupons: {
        Row: {
          active: boolean;
          code: string;
          created_at: string;
          discount_type: Database["public"]["Enums"]["discount_type"];
          discount_value: number;
          event_id: string;
          expires_at: string | null;
          id: string;
          max_uses: number | null;
          uses: number;
        };
        Insert: {
          active?: boolean;
          code: string;
          created_at?: string;
          discount_type: Database["public"]["Enums"]["discount_type"];
          discount_value: number;
          event_id: string;
          expires_at?: string | null;
          id?: string;
          max_uses?: number | null;
          uses?: number;
        };
        Update: {
          active?: boolean;
          code?: string;
          created_at?: string;
          discount_type?: Database["public"]["Enums"]["discount_type"];
          discount_value?: number;
          event_id?: string;
          expires_at?: string | null;
          id?: string;
          max_uses?: number | null;
          uses?: number;
        };
        Relationships: [
          {
            foreignKeyName: "coupons_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
        ];
      };
      events: {
        Row: {
          address: string | null;
          age_rating: string | null;
          capacity: number | null;
          category: string | null;
          city: string | null;
          cover_path: string | null;
          cover_url: string | null;
          created_at: string;
          created_by: string | null;
          description: string | null;
          ends_at: string | null;
          format: string;
          id: string;
          organizer_contact: string | null;
          organizer_name: string | null;
          postal_code: string | null;
          sales_end: string | null;
          sales_start: string | null;
          slug: string;
          starts_at: string;
          state: string | null;
          status: Database["public"]["Enums"]["event_status"];
          tagline: string | null;
          title: string;
          updated_at: string;
          updated_by: string | null;
          venue: string | null;
        };
        Insert: {
          address?: string | null;
          age_rating?: string | null;
          capacity?: number | null;
          category?: string | null;
          city?: string | null;
          cover_path?: string | null;
          cover_url?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          ends_at?: string | null;
          format?: string;
          id?: string;
          organizer_contact?: string | null;
          organizer_name?: string | null;
          postal_code?: string | null;
          sales_end?: string | null;
          sales_start?: string | null;
          slug: string;
          starts_at: string;
          state?: string | null;
          status?: Database["public"]["Enums"]["event_status"];
          tagline?: string | null;
          title: string;
          updated_at?: string;
          updated_by?: string | null;
          venue?: string | null;
        };
        Update: {
          address?: string | null;
          age_rating?: string | null;
          capacity?: number | null;
          category?: string | null;
          city?: string | null;
          cover_path?: string | null;
          cover_url?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          ends_at?: string | null;
          format?: string;
          id?: string;
          organizer_contact?: string | null;
          organizer_name?: string | null;
          postal_code?: string | null;
          sales_end?: string | null;
          sales_start?: string | null;
          slug?: string;
          starts_at?: string;
          state?: string | null;
          status?: Database["public"]["Enums"]["event_status"];
          tagline?: string | null;
          title?: string;
          updated_at?: string;
          updated_by?: string | null;
          venue?: string | null;
        };
        Relationships: [];
      };
      order_items: {
        Row: {
          base_price_cents: number;
          batch_id: string;
          created_at: string;
          fee_cents: number;
          id: string;
          order_id: string;
          quantity: number;
          ticket_name_snapshot: string | null;
          total_cents: number;
          unit_price_cents: number;
        };
        Insert: {
          base_price_cents?: number;
          batch_id: string;
          created_at?: string;
          fee_cents?: number;
          id?: string;
          order_id: string;
          quantity: number;
          ticket_name_snapshot?: string | null;
          total_cents?: number;
          unit_price_cents: number;
        };
        Update: {
          base_price_cents?: number;
          batch_id?: string;
          created_at?: string;
          fee_cents?: number;
          id?: string;
          order_id?: string;
          quantity?: number;
          ticket_name_snapshot?: string | null;
          total_cents?: number;
          unit_price_cents?: number;
        };
        Relationships: [
          {
            foreignKeyName: "order_items_batch_id_fkey";
            columns: ["batch_id"];
            isOneToOne: false;
            referencedRelation: "ticket_batches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_items_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ];
      };
      orders: {
        Row: {
          buyer_document: string | null;
          buyer_email: string | null;
          buyer_name: string | null;
          buyer_phone: string | null;
          commission_rate: number;
          coupon_id: string | null;
          created_at: string;
          currency: string;
          discount_cents: number;
          event_id: string;
          failure_reason: string | null;
          fee_cents: number;
          id: string;
          is_courtesy: boolean;
          paid_at: string | null;
          reservation_expires_at: string | null;
          status: Database["public"]["Enums"]["order_status"];
          stripe_checkout_session_id: string | null;
          stripe_payment_intent_id: string | null;
          subtotal_cents: number;
          total_cents: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          buyer_document?: string | null;
          buyer_email?: string | null;
          buyer_name?: string | null;
          buyer_phone?: string | null;
          commission_rate?: number;
          coupon_id?: string | null;
          created_at?: string;
          currency?: string;
          discount_cents?: number;
          event_id: string;
          failure_reason?: string | null;
          fee_cents?: number;
          id?: string;
          is_courtesy?: boolean;
          paid_at?: string | null;
          reservation_expires_at?: string | null;
          status?: Database["public"]["Enums"]["order_status"];
          stripe_checkout_session_id?: string | null;
          stripe_payment_intent_id?: string | null;
          subtotal_cents?: number;
          total_cents?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          buyer_document?: string | null;
          buyer_email?: string | null;
          buyer_name?: string | null;
          buyer_phone?: string | null;
          commission_rate?: number;
          coupon_id?: string | null;
          created_at?: string;
          currency?: string;
          discount_cents?: number;
          event_id?: string;
          failure_reason?: string | null;
          fee_cents?: number;
          id?: string;
          is_courtesy?: boolean;
          paid_at?: string | null;
          reservation_expires_at?: string | null;
          status?: Database["public"]["Enums"]["order_status"];
          stripe_checkout_session_id?: string | null;
          stripe_payment_intent_id?: string | null;
          subtotal_cents?: number;
          total_cents?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "orders_coupon_id_fkey";
            columns: ["coupon_id"];
            isOneToOne: false;
            referencedRelation: "coupons";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
        ];
      };
      payment_settings: {
        Row: {
          created_at: string;
          currency: string;
          enabled: boolean;
          environment: string;
          fixed_fee_cents: number;
          id: number;
          last_error: string | null;
          last_status: string | null;
          last_validated_at: string | null;
          payout_delay_days: number;
          platform_fee_percent: number;
          provider: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          created_at?: string;
          currency?: string;
          enabled?: boolean;
          environment?: string;
          fixed_fee_cents?: number;
          id?: number;
          last_error?: string | null;
          last_status?: string | null;
          last_validated_at?: string | null;
          payout_delay_days?: number;
          platform_fee_percent?: number;
          provider?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          created_at?: string;
          currency?: string;
          enabled?: boolean;
          environment?: string;
          fixed_fee_cents?: number;
          id?: number;
          last_error?: string | null;
          last_status?: string | null;
          last_validated_at?: string | null;
          payout_delay_days?: number;
          platform_fee_percent?: number;
          provider?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      platform_settings: {
        Row: {
          commission_rate: number;
          created_at: string;
          id: number;
          updated_at: string;
          whatsapp_enabled: boolean;
          whatsapp_message: string | null;
          whatsapp_number: string | null;
        };
        Insert: {
          commission_rate?: number;
          created_at?: string;
          id?: number;
          updated_at?: string;
          whatsapp_enabled?: boolean;
          whatsapp_message?: string | null;
          whatsapp_number?: string | null;
        };
        Update: {
          commission_rate?: number;
          created_at?: string;
          id?: number;
          updated_at?: string;
          whatsapp_enabled?: boolean;
          whatsapp_message?: string | null;
          whatsapp_number?: string | null;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          account_type_chosen: boolean;
          avatar_url: string | null;
          created_at: string;
          full_name: string | null;
          id: string;
          phone: string | null;
          updated_at: string;
        };
        Insert: {
          account_type_chosen?: boolean;
          avatar_url?: string | null;
          created_at?: string;
          full_name?: string | null;
          id: string;
          phone?: string | null;
          updated_at?: string;
        };
        Update: {
          account_type_chosen?: boolean;
          avatar_url?: string | null;
          created_at?: string;
          full_name?: string | null;
          id?: string;
          phone?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      stripe_webhook_events: {
        Row: {
          event_type: string;
          id: string;
          order_id: string | null;
          processed_at: string;
          stripe_event_id: string;
          summary: Json | null;
        };
        Insert: {
          event_type: string;
          id?: string;
          order_id?: string | null;
          processed_at?: string;
          stripe_event_id: string;
          summary?: Json | null;
        };
        Update: {
          event_type?: string;
          id?: string;
          order_id?: string | null;
          processed_at?: string;
          stripe_event_id?: string;
          summary?: Json | null;
        };
        Relationships: [];
      };
      ticket_batches: {
        Row: {
          active: boolean;
          created_at: string;
          description: string | null;
          event_id: string;
          id: string;
          max_per_order: number | null;
          name: string;
          price_cents: number;
          quantity: number;
          reserved: number;
          sales_end: string | null;
          sales_start: string | null;
          sold: number;
          sort_order: number;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          description?: string | null;
          event_id: string;
          id?: string;
          max_per_order?: number | null;
          name: string;
          price_cents: number;
          quantity: number;
          reserved?: number;
          sales_end?: string | null;
          sales_start?: string | null;
          sold?: number;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          description?: string | null;
          event_id?: string;
          id?: string;
          max_per_order?: number | null;
          name?: string;
          price_cents?: number;
          quantity?: number;
          reserved?: number;
          sales_end?: string | null;
          sales_start?: string | null;
          sold?: number;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ticket_batches_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
        ];
      };
      ticket_reservations: {
        Row: {
          batch_id: string;
          created_at: string;
          expires_at: string;
          id: string;
          order_id: string;
          quantity: number;
          status: string;
        };
        Insert: {
          batch_id: string;
          created_at?: string;
          expires_at: string;
          id?: string;
          order_id: string;
          quantity: number;
          status?: string;
        };
        Update: {
          batch_id?: string;
          created_at?: string;
          expires_at?: string;
          id?: string;
          order_id?: string;
          quantity?: number;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ticket_reservations_batch_id_fkey";
            columns: ["batch_id"];
            isOneToOne: false;
            referencedRelation: "ticket_batches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ticket_reservations_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ];
      };
      tickets: {
        Row: {
          batch_id: string;
          checked_in_at: string | null;
          checked_in_by: string | null;
          code: string;
          created_at: string;
          event_id: string;
          holder_email: string | null;
          holder_name: string | null;
          id: string;
          order_id: string;
          order_item_id: string | null;
          owner_user_id: string;
          secure_token: string;
          status: Database["public"]["Enums"]["ticket_status"];
        };
        Insert: {
          batch_id: string;
          checked_in_at?: string | null;
          checked_in_by?: string | null;
          code?: string;
          created_at?: string;
          event_id: string;
          holder_email?: string | null;
          holder_name?: string | null;
          id?: string;
          order_id: string;
          order_item_id?: string | null;
          owner_user_id: string;
          secure_token?: string;
          status?: Database["public"]["Enums"]["ticket_status"];
        };
        Update: {
          batch_id?: string;
          checked_in_at?: string | null;
          checked_in_by?: string | null;
          code?: string;
          created_at?: string;
          event_id?: string;
          holder_email?: string | null;
          holder_name?: string | null;
          id?: string;
          order_id?: string;
          order_item_id?: string | null;
          owner_user_id?: string;
          secure_token?: string;
          status?: Database["public"]["Enums"]["ticket_status"];
        };
        Relationships: [
          {
            foreignKeyName: "tickets_batch_id_fkey";
            columns: ["batch_id"];
            isOneToOne: false;
            referencedRelation: "ticket_batches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tickets_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tickets_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tickets_order_item_id_fkey";
            columns: ["order_item_id"];
            isOneToOne: false;
            referencedRelation: "order_items";
            referencedColumns: ["id"];
          },
        ];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      apply_payment_event_srv: {
        Args: {
          p_key: string;
          p_type: string;
          p_order_id: string | null;
          p_action: string;
          p_payload: Json;
        };
        Returns: Json;
      };
      set_user_role_srv: {
        Args: {
          p_actor: string;
          p_user_id: string;
          p_role: Database["public"]["Enums"]["app_role"];
        };
        Returns: undefined;
      };

      admin_refund_order_srv: {
        Args: { p_actor: string; p_order_id: string };
        Returns: Json;
      };
      cancel_event_srv: {
        Args: { p_actor: string; p_event_id: string };
        Returns: Json;
      };
      cancel_ticket_srv: {
        Args: { p_actor: string; p_ticket_id: string };
        Returns: Json;
      };
      check_in_ticket_srv: {
        Args: { p_actor: string; p_code: string };
        Returns: Json;
      };
      check_in_ticket_token_srv: {
        Args: { p_actor: string; p_event_id?: string; p_token: string };
        Returns: Json;
      };
      choose_account_type_srv: {
        Args: { p_actor: string; p_type: string };
        Returns: undefined;
      };
      confirm_paid_order: {
        Args: {
          p_amount_total: number;
          p_currency: string;
          p_order_id: string;
          p_payment_intent: string;
          p_session_id: string;
        };
        Returns: Json;
      };
      expire_stale_orders: { Args: never; Returns: number };
      issue_courtesy_tickets_srv: {
        Args: {
          p_actor: string;
          p_batch_id: string;
          p_event_id: string;
          p_quantity?: number;
          p_user_id: string;
        };
        Returns: Json;
      };
      issue_external_paid_tickets_srv: {
        Args: {
          p_actor: string;
          p_batch_id: string;
          p_event_id: string;
          p_quantity?: number;
          p_user_id: string;
        };
        Returns: Json;
      };
      refund_order: { Args: { p_order_id: string }; Returns: Json };
      release_order: {
        Args: { p_order_id: string; p_reason?: string; p_status: string };
        Returns: Json;
      };
      reserve_tickets: {
        Args: {
          p_buyer_document: string;
          p_buyer_email: string;
          p_buyer_name: string;
          p_buyer_phone: string;
          p_coupon_code: string;
          p_event_id: string;
          p_hold_minutes?: number;
          p_items: Json;
          p_user_id: string;
        };
        Returns: Json;
      };
      validate_coupon: {
        Args: { p_code: string; p_event_id: string };
        Returns: Json;
      };
    };
    Enums: {
      app_role: "admin" | "organizer" | "user" | "moderator";
      discount_type: "percent" | "fixed";
      event_status: "draft" | "published" | "ended" | "cancelled";
      order_status: "pending" | "paid" | "cancelled" | "refunded" | "failed" | "expired";
      ticket_status: "valid" | "checked_in" | "cancelled" | "refunded";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "organizer", "user", "moderator"],
      discount_type: ["percent", "fixed"],
      event_status: ["draft", "published", "ended", "cancelled"],
      order_status: ["pending", "paid", "cancelled", "refunded", "failed", "expired"],
      ticket_status: ["valid", "checked_in", "cancelled", "refunded"],
    },
  },
} as const;
