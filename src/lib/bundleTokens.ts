import { timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function safeTokenEquals(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);

  if (aBuffer.length !== bBuffer.length) {
    return false;
  }

  return timingSafeEqual(aBuffer, bBuffer);
}

export async function verifyEditToken(id: string, token: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("bundles")
    .select("id, edit_token")
    .eq("id", id)
    .single();

  if (error || !data || !data.edit_token) {
    return false;
  }

  return safeTokenEquals(String(data.edit_token), token);
}
