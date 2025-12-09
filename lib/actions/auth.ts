"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

// Validation schemas
const emailSchema = z.string().email("Invalid email address").max(255);
const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password must be less than 72 characters")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[0-9]/, "Password must contain at least one number");
// nameSchema kept for future use when signups are re-enabled
// const nameSchema = z
//   .string()
//   .min(1, "Name is required")
//   .max(100, "Name must be less than 100 characters")
//   .regex(/^[a-zA-Z\s'-]+$/, "Name contains invalid characters");

// Rate limiting helper (simple in-memory, use Redis in production)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_ATTEMPTS = 5;

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(key);

  if (!record || now > record.resetTime) {
    rateLimitMap.set(key, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (record.count >= MAX_ATTEMPTS) {
    return false;
  }

  record.count++;
  return true;
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function signInWithEmail(formData: FormData) {
  const supabase = await createClient();

  const rawEmail = formData.get("email");
  const rawPassword = formData.get("password");

  // Validate inputs
  const emailResult = emailSchema.safeParse(rawEmail);
  if (!emailResult.success) {
    return { error: emailResult.error.issues[0].message };
  }

  if (!rawPassword || typeof rawPassword !== "string") {
    return { error: "Password is required" };
  }

  const email = emailResult.data.toLowerCase().trim();

  // Rate limiting by email
  if (!checkRateLimit(`signin:${email}`)) {
    return { error: "Too many login attempts. Please try again later." };
  }

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: rawPassword,
  });

  if (error) {
    // Generic error message to prevent user enumeration
    return { error: "Invalid email or password" };
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function signUpWithEmail(_formData: FormData) {
  // Signups are disabled for this private instance
  return { error: "Signups are currently disabled" };
}

export async function signInWithOAuth(provider: "google" | "github") {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3001"}/auth/callback`,
    },
  });

  if (error) {
    return { error: error.message };
  }

  if (data.url) {
    redirect(data.url);
  }
}

export async function resetPassword(formData: FormData) {
  const supabase = await createClient();

  const rawEmail = formData.get("email");
  const emailResult = emailSchema.safeParse(rawEmail);

  if (!emailResult.success) {
    return { error: emailResult.error.issues[0].message };
  }

  const email = emailResult.data.toLowerCase().trim();

  // Rate limiting for password reset
  if (!checkRateLimit(`reset:${email}`)) {
    return { error: "Too many reset attempts. Please try again later." };
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3001"}/reset-password`,
  });

  // Always return success to prevent user enumeration
  if (error) {
    console.error("Password reset error:", error.message);
  }

  return { success: true };
}

export async function updatePassword(formData: FormData) {
  const supabase = await createClient();

  const rawPassword = formData.get("password");
  const rawConfirmPassword = formData.get("confirmPassword");

  // Validate password
  const passwordResult = passwordSchema.safeParse(rawPassword);
  if (!passwordResult.success) {
    return { error: passwordResult.error.issues[0].message };
  }

  if (rawPassword !== rawConfirmPassword) {
    return { error: "Passwords do not match" };
  }

  const { error } = await supabase.auth.updateUser({
    password: passwordResult.data,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function updateProfile(formData: FormData) {
  const supabase = await createClient();

  const fullName = formData.get("fullName") as string;

  const { error: authError } = await supabase.auth.updateUser({
    data: { full_name: fullName },
  });

  if (authError) {
    return { error: authError.message };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { error: profileError } = await supabase
      .from("profiles")
      .update({ full_name: fullName } as never)
      .eq("id", user.id);

    if (profileError) {
      return { error: profileError.message };
    }
  }

  revalidatePath("/dashboard/settings", "page");
  return { success: true };
}

export async function updateEmail(formData: FormData) {
  const supabase = await createClient();

  const email = formData.get("email") as string;

  const { error } = await supabase.auth.updateUser(
    { email },
    {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3001"}/auth/callback`,
    },
  );

  if (error) {
    return { error: error.message };
  }

  return {
    success: true,
    message: "Check your new email for a confirmation link",
  };
}

export async function deleteAccount() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  // Delete user data (cascades will handle related records)
  const { error: deleteError } = await supabase
    .from("profiles")
    .delete()
    .eq("id", user.id);

  if (deleteError) {
    return { error: deleteError.message };
  }

  await supabase.auth.signOut();
  redirect("/");
}

export async function resendVerificationEmail(email: string) {
  const supabase = await createClient();

  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3001"}/auth/callback`,
    },
  });

  if (error) {
    return { error: error.message };
  }

  return { success: true };
}
