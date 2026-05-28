import { createClient, type SupabaseClient } from "@supabase/supabase-js"

export const STORAGE_BUCKET = "legal-documents"

let _admin: SupabaseClient | null = null

export function getSupabaseAdmin(): SupabaseClient {
  if (_admin) return _admin

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error(
      "Supabase storage is not configured. " +
        "Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to .env.local."
    )
  }

  _admin = createClient(url, key, {
    auth: { persistSession: false },
  })
  return _admin
}
