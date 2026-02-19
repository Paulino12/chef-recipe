type LooseTable = {
  Row: Record<string, unknown>;
  Insert: Record<string, unknown>;
  Update: Record<string, unknown>;
  Relationships: [];
};

type LooseView = {
  Row: Record<string, unknown>;
  Relationships: [];
};

/**
 * Transitional Supabase Database typing.
 *
 * This avoids `any` and `never` inference issues while we are not yet
 * generating exact types from Supabase. Once generated types are available,
 * replace this with the canonical generated `Database` type.
 */
export type Database = {
  public: {
    Tables: Record<string, LooseTable>;
    Views: Record<string, LooseView>;
    Functions: Record<string, never>;
    Enums: Record<string, string>;
    CompositeTypes: Record<string, never>;
  };
};
