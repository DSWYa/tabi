
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "admin_emails": {
                  Row: {
                    "created_at": string,"email": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"email": string
                  }
                  Update: {
                    "created_at"?: string,"email"?: string
                  }
                  Relationships: [
                    
                  ]
                },"family_invite": {
                  Row: {
                    "code": string,"enabled": boolean,"id": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "code": string,"enabled"?: boolean,"id"?: number,"updated_at"?: string
                  }
                  Update: {
                    "code"?: string,"enabled"?: boolean,"id"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"geocode_cache": {
                  Row: {
                    "created_at": string,"display_name": string | null,"found": boolean,"lat": number | null,"lng": number | null,"query": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"display_name"?: string | null,"found": boolean,"lat"?: number | null,"lng"?: number | null,"query": string
                  }
                  Update: {
                    "created_at"?: string,"display_name"?: string | null,"found"?: boolean,"lat"?: number | null,"lng"?: number | null,"query"?: string
                  }
                  Relationships: [
                    
                  ]
                },"itinerary_items": {
                  Row: {
                    "created_at": string,"created_by": string | null,"day": string,"end_time": string | null,"id": string,"notes": string | null,"place_id": string | null,"reservation_ref": string | null,"reservation_status": string,"reservation_time": string | null,"slot": string,"sort_order": number,"start_time": string | null,"title": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"day": string,"end_time"?: string | null,"id"?: string,"notes"?: string | null,"place_id"?: string | null,"reservation_ref"?: string | null,"reservation_status"?: string,"reservation_time"?: string | null,"slot"?: string,"sort_order"?: number,"start_time"?: string | null,"title"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"day"?: string,"end_time"?: string | null,"id"?: string,"notes"?: string | null,"place_id"?: string | null,"reservation_ref"?: string | null,"reservation_status"?: string,"reservation_time"?: string | null,"slot"?: string,"sort_order"?: number,"start_time"?: string | null,"title"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "itinerary_items_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "itinerary_items_place_id_fkey"
      columns: ["place_id"]
isOneToOne: false
      referencedRelation: "places"
      referencedColumns: ["id"]
    }
                  ]
                },"itinerary_suggestions": {
                  Row: {
                    "created_at": string,"day": string,"id": string,"item_id": string | null,"note": string | null,"place_id": string | null,"review_note": string | null,"reviewed_at": string | null,"reviewed_by": string | null,"slot": string,"start_time": string | null,"status": string,"suggested_by": string,"title": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"day": string,"id"?: string,"item_id"?: string | null,"note"?: string | null,"place_id"?: string | null,"review_note"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"slot": string,"start_time"?: string | null,"status"?: string,"suggested_by"?: string,"title"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"day"?: string,"id"?: string,"item_id"?: string | null,"note"?: string | null,"place_id"?: string | null,"review_note"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"slot"?: string,"start_time"?: string | null,"status"?: string,"suggested_by"?: string,"title"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "itinerary_suggestions_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "itinerary_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "itinerary_suggestions_place_id_fkey"
      columns: ["place_id"]
isOneToOne: false
      referencedRelation: "places"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "itinerary_suggestions_reviewed_by_fkey"
      columns: ["reviewed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "itinerary_suggestions_suggested_by_fkey"
      columns: ["suggested_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"notifications": {
                  Row: {
                    "actor_id": string | null,"body": string | null,"created_at": string,"id": string,"kind": string,"link": string | null,"read_at": string | null,"title": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id"?: string | null,"body"?: string | null,"created_at"?: string,"id"?: string,"kind": string,"link"?: string | null,"read_at"?: string | null,"title": string,"user_id": string
                  }
                  Update: {
                    "actor_id"?: string | null,"body"?: string | null,"created_at"?: string,"id"?: string,"kind"?: string,"link"?: string | null,"read_at"?: string | null,"title"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"places": {
                  Row: {
                    "added_by": string | null,"address": string | null,"category": string,"created_at": string,"geocode_status": string,"geocoded_address": string | null,"id": string,"lat": number | null,"lng": number | null,"name": string,"notes": string | null,"price_jpy": number | null,"priority": number,"status": string,"status_changed_at": string | null,"status_changed_by": string | null,"updated_at": string,"website": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "added_by"?: string | null,"address"?: string | null,"category"?: string,"created_at"?: string,"geocode_status"?: string,"geocoded_address"?: string | null,"id"?: string,"lat"?: number | null,"lng"?: number | null,"name": string,"notes"?: string | null,"price_jpy"?: number | null,"priority"?: number,"status"?: string,"status_changed_at"?: string | null,"status_changed_by"?: string | null,"updated_at"?: string,"website"?: string | null
                  }
                  Update: {
                    "added_by"?: string | null,"address"?: string | null,"category"?: string,"created_at"?: string,"geocode_status"?: string,"geocoded_address"?: string | null,"id"?: string,"lat"?: number | null,"lng"?: number | null,"name"?: string,"notes"?: string | null,"price_jpy"?: number | null,"priority"?: number,"status"?: string,"status_changed_at"?: string | null,"status_changed_by"?: string | null,"updated_at"?: string,"website"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "places_added_by_fkey"
      columns: ["added_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "places_status_changed_by_fkey"
      columns: ["status_changed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "avatar_path": string | null,"created_at": string,"display_name": string,"id": string,"notification_prefs": NonNullable<Json>,"pin_color": string | null,"role": string,"theme": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "avatar_path"?: string | null,"created_at"?: string,"display_name": string,"id": string,"notification_prefs"?: NonNullable<Json>,"pin_color"?: string | null,"role"?: string,"theme"?: string,"updated_at"?: string
                  }
                  Update: {
                    "avatar_path"?: string | null,"created_at"?: string,"display_name"?: string,"id"?: string,"notification_prefs"?: NonNullable<Json>,"pin_color"?: string | null,"role"?: string,"theme"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"reservation_reminders": {
                  Row: {
                    "day": string,"item_id": string,"sent_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "day": string,"item_id": string,"sent_at"?: string
                  }
                  Update: {
                    "day"?: string,"item_id"?: string,"sent_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "reservation_reminders_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "itinerary_items"
      referencedColumns: ["id"]
    }
                  ]
                },"travel_sections": {
                  Row: {
                    "body": string,"created_at": string,"icon": string | null,"id": string,"sort_order": number,"title": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "body"?: string,"created_at"?: string,"icon"?: string | null,"id"?: string,"sort_order"?: number,"title": string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "body"?: string,"created_at"?: string,"icon"?: string | null,"id"?: string,"sort_order"?: number,"title"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "travel_sections_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"trip": {
                  Row: {
                    "destination": string,"end_date": string | null,"id": number,"name": string,"start_date": string | null,"timezone": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "destination"?: string,"end_date"?: string | null,"id"?: number,"name"?: string,"start_date"?: string | null,"timezone"?: string,"updated_at"?: string
                  }
                  Update: {
                    "destination"?: string,"end_date"?: string | null,"id"?: number,"name"?: string,"start_date"?: string | null,"timezone"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"votes": {
                  Row: {
                    "created_at": string,"place_id": string,"updated_at": string,"user_id": string,"vote": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"place_id": string,"updated_at"?: string,"user_id"?: string,"vote": string
                  }
                  Update: {
                    "created_at"?: string,"place_id"?: string,"updated_at"?: string,"user_id"?: string,"vote"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "votes_place_id_fkey"
      columns: ["place_id"]
isOneToOne: false
      referencedRelation: "places"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "votes_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"whiteboard": {
                  Row: {
                    "elements": NonNullable<Json>,"files": NonNullable<Json>,"id": number,"updated_at": string,"updated_by": string | null,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "elements"?: NonNullable<Json>,"files"?: NonNullable<Json>,"id"?: number,"updated_at"?: string,"updated_by"?: string | null,"version"?: number
                  }
                  Update: {
                    "elements"?: NonNullable<Json>,"files"?: NonNullable<Json>,"id"?: number,"updated_at"?: string,"updated_by"?: string | null,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "whiteboard_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "add_admin_email":
{ Args: { "email": string }; Returns: string
                           },
"check_family_code":
{ Args: { "code": string }; Returns: boolean
                           },
"format_when":
{ Args: { "p_day": string,"p_slot": string,"p_time"?: string }; Returns: string
                           },
"generate_family_code":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"is_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_member":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_owner_email":
{ Args: { "uid": string }; Returns: boolean
                           },
"itinerary_item_name":
{ Args: { "p_place_id": string,"p_title": string }; Returns: string
                           },
"itinerary_sort_order_for":
{ Args: { "p_day": string,"p_exclude"?: string,"p_slot": string,"p_start": string }; Returns: number
                           },
"join_family":
{ Args: { "code": string,"display_name": string }; Returns: {
              "avatar_path": string | null,
"created_at": string,
"display_name": string,
"id": string,
"notification_prefs": NonNullable<Json>,
"pin_color": string | null,
"role": string,
"theme": string,
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "profiles"
        isOneToOne: true
        isSetofReturn: false
      } },
"member_ids":
{ Args: { "admins_only"?: boolean }; Returns: (string)[]
                           },
"member_name":
{ Args: { "uid": string }; Returns: string
                           },
"move_itinerary_item":
{ Args: { "item_id": string,"to_day": string,"to_index": number,"to_slot": string }; Returns: undefined
                           },
"move_travel_section":
{ Args: { "section_id": string,"to_index": number }; Returns: undefined
                           },
"normalize_code":
{ Args: { "c": string }; Returns: string
                           },
"notification_defaults":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"notify":
{ Args: { "p_actor": string,"p_body": string,"p_kind": string,"p_link": string,"p_recipients": (string)[],"p_title": string }; Returns: undefined
                           },
"place_is_open":
{ Args: { "p_place_id": string }; Returns: boolean
                           },
"remove_member":
{ Args: { "target": string }; Returns: undefined
                           },
"review_itinerary_suggestion":
{ Args: { "approve": boolean,"review_note"?: string,"suggestion_id": string }; Returns: string
                           },
"rotate_family_code":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"send_reservation_reminders":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"set_member_role":
{ Args: { "new_role": string,"target": string }; Returns: undefined
                           },
"suggestion_name":
{ Args: { "p_item_id": string,"p_place_id": string,"p_title": string }; Returns: string
                           },
"unused_storage_objects":
{ Args: Record<PropertyKey, never>; Returns: {
              "bucket_id": string,"name": string
            }[]
                           },
"wants_notification":
{ Args: { "kind": string,"uid": string }; Returns: boolean
                           },
"whiteboard_files_valid":
{ Args: { "files": Json }; Returns: boolean
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

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            
          }
        }
} as const
