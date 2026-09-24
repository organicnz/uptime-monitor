import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { isMfaVerificationRequired } from "@/lib/mfa";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type AuthenticatedHandler = (
  supabase: SupabaseServerClient,
  user: User,
) => Promise<NextResponse>;

type AuthOptions = {
  requireMfa?: boolean;
};

export async function withAuth(
  handler: AuthenticatedHandler,
  options: AuthOptions = {},
): Promise<NextResponse> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (options.requireMfa && (await isMfaVerificationRequired(supabase))) {
      return NextResponse.json(
        { error: "MFA verification required" },
        { status: 403 },
      );
    }

    return await handler(supabase, user);
  } catch (caughtError) {
    console.error("Auth handler error:", caughtError);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
