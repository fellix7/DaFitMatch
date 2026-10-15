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
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      archetypes: {
        Row: {
          benchmark_brands: string[]
          centroid: unknown
          created_at: string
          description: string
          id: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          benchmark_brands?: string[]
          centroid?: unknown
          created_at?: string
          description?: string
          id?: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          benchmark_brands?: string[]
          centroid?: unknown
          created_at?: string
          description?: string
          id?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      date_rooms: {
        Row: {
          budget_a_inr: number | null
          budget_b_inr: number | null
          coordination_mode: Database["public"]["Enums"]["coordination_mode"]
          created_at: string
          id: string
          invite_code: string
          occasion: Database["public"]["Enums"]["occasion"]
          status: Database["public"]["Enums"]["room_status"]
          updated_at: string
          user_a: string | null
          user_b: string | null
        }
        Insert: {
          budget_a_inr?: number | null
          budget_b_inr?: number | null
          coordination_mode?: Database["public"]["Enums"]["coordination_mode"]
          created_at?: string
          id?: string
          invite_code?: string
          occasion: Database["public"]["Enums"]["occasion"]
          status?: Database["public"]["Enums"]["room_status"]
          updated_at?: string
          user_a?: string | null
          user_b?: string | null
        }
        Update: {
          budget_a_inr?: number | null
          budget_b_inr?: number | null
          coordination_mode?: Database["public"]["Enums"]["coordination_mode"]
          created_at?: string
          id?: string
          invite_code?: string
          occasion?: Database["public"]["Enums"]["occasion"]
          status?: Database["public"]["Enums"]["room_status"]
          updated_at?: string
          user_a?: string | null
          user_b?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "date_rooms_user_a_fkey"
            columns: ["user_a"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "date_rooms_user_b_fkey"
            columns: ["user_b"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      interactions: {
        Row: {
          action: Database["public"]["Enums"]["interaction_action"]
          created_at: string
          id: string
          target_id: string
          target_type: Database["public"]["Enums"]["interaction_target"]
          user_id: string
        }
        Insert: {
          action: Database["public"]["Enums"]["interaction_action"]
          created_at?: string
          id?: string
          target_id: string
          target_type: Database["public"]["Enums"]["interaction_target"]
          user_id: string
        }
        Update: {
          action?: Database["public"]["Enums"]["interaction_action"]
          created_at?: string
          id?: string
          target_id?: string
          target_type?: Database["public"]["Enums"]["interaction_target"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "interactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      outfits: {
        Row: {
          archetype_id: string | null
          created_at: string
          id: string
          item_ids: string[]
          occasion: Database["public"]["Enums"]["occasion"] | null
          owner_id: string
          rationale: string | null
          score: number | null
          styling_tip: string | null
          total_price_inr: number
          wardrobe_item_ids: string[]
        }
        Insert: {
          archetype_id?: string | null
          created_at?: string
          id?: string
          item_ids?: string[]
          occasion?: Database["public"]["Enums"]["occasion"] | null
          owner_id: string
          rationale?: string | null
          score?: number | null
          styling_tip?: string | null
          total_price_inr?: number
          wardrobe_item_ids?: string[]
        }
        Update: {
          archetype_id?: string | null
          created_at?: string
          id?: string
          item_ids?: string[]
          occasion?: Database["public"]["Enums"]["occasion"] | null
          owner_id?: string
          rationale?: string | null
          score?: number | null
          styling_tip?: string | null
          total_price_inr?: number
          wardrobe_item_ids?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "outfits_archetype_id_fkey"
            columns: ["archetype_id"]
            isOneToOne: false
            referencedRelation: "archetypes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outfits_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          affiliate_url: string
          brand: string
          category: string
          colors: string[]
          created_at: string
          embedding: unknown
          external_id: string
          formality: number
          gender: Database["public"]["Enums"]["product_gender"]
          id: string
          image_url: string
          in_stock: boolean
          last_seen_at: string | null
          last_shown_at: string | null
          occasions: string[]
          price_inr: number
          slot: Database["public"]["Enums"]["slot"]
          source: Database["public"]["Enums"]["product_source"]
          title: string
          updated_at: string
        }
        Insert: {
          affiliate_url: string
          brand: string
          category: string
          colors?: string[]
          created_at?: string
          embedding?: unknown
          external_id: string
          formality: number
          gender: Database["public"]["Enums"]["product_gender"]
          id?: string
          image_url: string
          in_stock?: boolean
          last_seen_at?: string | null
          last_shown_at?: string | null
          occasions?: string[]
          price_inr: number
          slot: Database["public"]["Enums"]["slot"]
          source: Database["public"]["Enums"]["product_source"]
          title: string
          updated_at?: string
        }
        Update: {
          affiliate_url?: string
          brand?: string
          category?: string
          colors?: string[]
          created_at?: string
          embedding?: unknown
          external_id?: string
          formality?: number
          gender?: Database["public"]["Enums"]["product_gender"]
          id?: string
          image_url?: string
          in_stock?: boolean
          last_seen_at?: string | null
          last_shown_at?: string | null
          occasions?: string[]
          price_inr?: number
          slot?: Database["public"]["Enums"]["slot"]
          source?: Database["public"]["Enums"]["product_source"]
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          age_confirmed_at: string | null
          city: string | null
          created_at: string
          default_budget_inr: number | null
          display_name: string | null
          gender_presentation:
            | Database["public"]["Enums"]["gender_presentation"]
            | null
          height_cm: number | null
          id: string
          is_adult: boolean
          updated_at: string
        }
        Insert: {
          age_confirmed_at?: string | null
          city?: string | null
          created_at?: string
          default_budget_inr?: number | null
          display_name?: string | null
          gender_presentation?:
            | Database["public"]["Enums"]["gender_presentation"]
            | null
          height_cm?: number | null
          id: string
          is_adult?: boolean
          updated_at?: string
        }
        Update: {
          age_confirmed_at?: string | null
          city?: string | null
          created_at?: string
          default_budget_inr?: number | null
          display_name?: string | null
          gender_presentation?:
            | Database["public"]["Enums"]["gender_presentation"]
            | null
          height_cm?: number | null
          id?: string
          is_adult?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      reference_looks: {
        Row: {
          archetype_id: string
          created_at: string
          embedding: unknown
          gender: Database["public"]["Enums"]["product_gender"]
          id: string
          source_brand: string
          source_url: string | null
        }
        Insert: {
          archetype_id: string
          created_at?: string
          embedding?: unknown
          gender: Database["public"]["Enums"]["product_gender"]
          id?: string
          source_brand: string
          source_url?: string | null
        }
        Update: {
          archetype_id?: string
          created_at?: string
          embedding?: unknown
          gender?: Database["public"]["Enums"]["product_gender"]
          id?: string
          source_brand?: string
          source_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reference_looks_archetype_id_fkey"
            columns: ["archetype_id"]
            isOneToOne: false
            referencedRelation: "archetypes"
            referencedColumns: ["id"]
          },
        ]
      }
      room_pairs: {
        Row: {
          created_at: string
          id: string
          is_locked: boolean
          outfit_a_id: string | null
          outfit_b_id: string | null
          pair_score: number | null
          palette: string[]
          room_id: string
          venue_ids: string[]
          vote_a: Database["public"]["Enums"]["vote"] | null
          vote_b: Database["public"]["Enums"]["vote"] | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_locked?: boolean
          outfit_a_id?: string | null
          outfit_b_id?: string | null
          pair_score?: number | null
          palette?: string[]
          room_id: string
          venue_ids?: string[]
          vote_a?: Database["public"]["Enums"]["vote"] | null
          vote_b?: Database["public"]["Enums"]["vote"] | null
        }
        Update: {
          created_at?: string
          id?: string
          is_locked?: boolean
          outfit_a_id?: string | null
          outfit_b_id?: string | null
          pair_score?: number | null
          palette?: string[]
          room_id?: string
          venue_ids?: string[]
          vote_a?: Database["public"]["Enums"]["vote"] | null
          vote_b?: Database["public"]["Enums"]["vote"] | null
        }
        Relationships: [
          {
            foreignKeyName: "room_pairs_outfit_a_id_fkey"
            columns: ["outfit_a_id"]
            isOneToOne: false
            referencedRelation: "outfits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_pairs_outfit_b_id_fkey"
            columns: ["outfit_b_id"]
            isOneToOne: false
            referencedRelation: "outfits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_pairs_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "date_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      taste_profiles: {
        Row: {
          archetype_weights: Json
          colors_avoid: string[]
          colors_like: string[]
          comfort_vs_statement: number
          fit_prefs: Json
          interaction_count: number
          never_wear: string[]
          taste_vector: unknown
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          archetype_weights?: Json
          colors_avoid?: string[]
          colors_like?: string[]
          comfort_vs_statement?: number
          fit_prefs?: Json
          interaction_count?: number
          never_wear?: string[]
          taste_vector?: unknown
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          archetype_weights?: Json
          colors_avoid?: string[]
          colors_like?: string[]
          comfort_vs_statement?: number
          fit_prefs?: Json
          interaction_count?: number
          never_wear?: string[]
          taste_vector?: unknown
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "taste_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tryons: {
        Row: {
          cost_usd: number
          created_at: string
          error: string | null
          id: string
          input_hash: string
          input_photo_path: string
          outfit_id: string | null
          product_id: string
          provider: string
          result_path: string | null
          status: Database["public"]["Enums"]["tryon_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          cost_usd?: number
          created_at?: string
          error?: string | null
          id?: string
          input_hash: string
          input_photo_path: string
          outfit_id?: string | null
          product_id: string
          provider: string
          result_path?: string | null
          status?: Database["public"]["Enums"]["tryon_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          cost_usd?: number
          created_at?: string
          error?: string | null
          id?: string
          input_hash?: string
          input_photo_path?: string
          outfit_id?: string | null
          product_id?: string
          provider?: string
          result_path?: string | null
          status?: Database["public"]["Enums"]["tryon_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tryons_outfit_id_fkey"
            columns: ["outfit_id"]
            isOneToOne: false
            referencedRelation: "outfits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tryons_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tryons_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_limits: {
        Row: {
          day: string
          tryon_count: number
          user_id: string
        }
        Insert: {
          day: string
          tryon_count?: number
          user_id: string
        }
        Update: {
          day?: string
          tryon_count?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_limits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      venues: {
        Row: {
          archetype_affinity: Json
          category: string
          city: string
          created_at: string
          id: string
          is_open: boolean
          lat: number
          lng: number
          maps_url: string | null
          name: string
          place_id: string
          price_level: number | null
          refreshed_at: string | null
          vibe_embedding: unknown
          vibe_tags: string[]
        }
        Insert: {
          archetype_affinity?: Json
          category: string
          city: string
          created_at?: string
          id?: string
          is_open?: boolean
          lat: number
          lng: number
          maps_url?: string | null
          name: string
          place_id: string
          price_level?: number | null
          refreshed_at?: string | null
          vibe_embedding?: unknown
          vibe_tags?: string[]
        }
        Update: {
          archetype_affinity?: Json
          category?: string
          city?: string
          created_at?: string
          id?: string
          is_open?: boolean
          lat?: number
          lng?: number
          maps_url?: string | null
          name?: string
          place_id?: string
          price_level?: number | null
          refreshed_at?: string | null
          vibe_embedding?: unknown
          vibe_tags?: string[]
        }
        Relationships: []
      }
      wardrobe_items: {
        Row: {
          category: string
          colors: string[]
          created_at: string
          embedding: unknown
          formality: number | null
          id: string
          image_path: string | null
          is_archived: boolean
          occasions: string[]
          slot: Database["public"]["Enums"]["slot"]
          tags: string[]
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          category: string
          colors?: string[]
          created_at?: string
          embedding?: unknown
          formality?: number | null
          id?: string
          image_path?: string | null
          is_archived?: boolean
          occasions?: string[]
          slot: Database["public"]["Enums"]["slot"]
          tags?: string[]
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          colors?: string[]
          created_at?: string
          embedding?: unknown
          formality?: number | null
          id?: string
          image_path?: string | null
          is_archived?: boolean
          occasions?: string[]
          slot?: Database["public"]["Enums"]["slot"]
          tags?: string[]
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wardrobe_items_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      confirm_age: { Args: { birth_date: string }; Returns: boolean }
      consume_tryon_quota: { Args: never; Returns: number }
      join_room: {
        Args: { p_budget_inr?: number; p_invite_code: string }
        Returns: string
      }
      leave_room: { Args: { p_room_id: string }; Returns: undefined }
      lock_room_pair: {
        Args: { p_pair_id: string }
        Returns: {
          created_at: string
          id: string
          is_locked: boolean
          outfit_a_id: string | null
          outfit_b_id: string | null
          pair_score: number | null
          palette: string[]
          room_id: string
          venue_ids: string[]
          vote_a: Database["public"]["Enums"]["vote"] | null
          vote_b: Database["public"]["Enums"]["vote"] | null
        }
        SetofOptions: {
          from: "*"
          to: "room_pairs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      match_products: {
        Args: {
          k?: number
          max_price?: number
          p_gender: Database["public"]["Enums"]["product_gender"]
          p_slot: Database["public"]["Enums"]["slot"]
          query_vec: unknown
        }
        Returns: {
          affiliate_url: string
          brand: string
          category: string
          colors: string[]
          external_id: string
          formality: number
          gender: Database["public"]["Enums"]["product_gender"]
          id: string
          image_url: string
          in_stock: boolean
          last_seen_at: string
          occasions: string[]
          price_inr: number
          similarity: number
          slot: Database["public"]["Enums"]["slot"]
          source: Database["public"]["Enums"]["product_source"]
          title: string
        }[]
      }
      match_wardrobe: {
        Args: {
          k?: number
          p_slot: Database["public"]["Enums"]["slot"]
          query_vec: unknown
        }
        Returns: {
          category: string
          colors: string[]
          id: string
          similarity: number
          slot: Database["public"]["Enums"]["slot"]
          title: string
        }[]
      }
      room_members: {
        Args: { p_room_id: string }
        Returns: {
          display_name: string
          seat: string
          user_id: string
        }[]
      }
      vote_room_pair: {
        Args: { p_pair_id: string; p_vote: Database["public"]["Enums"]["vote"] }
        Returns: {
          created_at: string
          id: string
          is_locked: boolean
          outfit_a_id: string | null
          outfit_b_id: string | null
          pair_score: number | null
          palette: string[]
          room_id: string
          venue_ids: string[]
          vote_a: Database["public"]["Enums"]["vote"] | null
          vote_b: Database["public"]["Enums"]["vote"] | null
        }
        SetofOptions: {
          from: "*"
          to: "room_pairs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      coordination_mode: "matching" | "complementary" | "one_leads"
      gender_presentation: "masculine" | "feminine" | "androgynous"
      interaction_action:
        | "like"
        | "skip"
        | "love"
        | "save"
        | "click"
        | "tryon"
        | "swap"
      interaction_target:
        | "product"
        | "outfit"
        | "room_pair"
        | "venue"
        | "archetype"
        | "wardrobe_item"
      occasion:
        | "brunch"
        | "dinner"
        | "gallery"
        | "rooftop"
        | "movie"
        | "festive"
      product_gender: "men" | "women" | "unisex"
      product_source: "myntra" | "ajio" | "flipkart" | "amazon" | "other"
      room_status: "open" | "active" | "locked" | "closed"
      slot: "top" | "bottom" | "footwear" | "layer" | "accessory" | "full"
      tryon_status: "queued" | "running" | "succeeded" | "failed"
      vote: "up" | "down"
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
    Enums: {
      coordination_mode: ["matching", "complementary", "one_leads"],
      gender_presentation: ["masculine", "feminine", "androgynous"],
      interaction_action: [
        "like",
        "skip",
        "love",
        "save",
        "click",
        "tryon",
        "swap",
      ],
      interaction_target: [
        "product",
        "outfit",
        "room_pair",
        "venue",
        "archetype",
        "wardrobe_item",
      ],
      occasion: ["brunch", "dinner", "gallery", "rooftop", "movie", "festive"],
      product_gender: ["men", "women", "unisex"],
      product_source: ["myntra", "ajio", "flipkart", "amazon", "other"],
      room_status: ["open", "active", "locked", "closed"],
      slot: ["top", "bottom", "footwear", "layer", "accessory", "full"],
      tryon_status: ["queued", "running", "succeeded", "failed"],
      vote: ["up", "down"],
    },
  },
} as const
