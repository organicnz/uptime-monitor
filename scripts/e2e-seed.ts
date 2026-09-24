import { createClient } from "@supabase/supabase-js";

const email = process.env.E2E_EMAIL ?? "e2e@uptime-monitor.test";
const password = process.env.E2E_PASSWORD ?? "E2ePassword123";
const statusSlug = process.env.E2E_PUBLIC_STATUS_SLUG ?? "e2e-status";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Local Supabase URL and service role key are required");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

if (
  !supabaseUrl.startsWith("http://127.0.0.1:") &&
  !supabaseUrl.startsWith("http://localhost:")
) {
  throw new Error(
    "E2E Supabase URL must be a local instance (127.0.0.1 or localhost)",
  );
}

async function findOrCreateUser(): Promise<string> {
  const { data: created, error: createError } =
    await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
  if (created.user) return created.user.id;
  if (!createError || !/already|registered|exists/i.test(createError.message)) {
    throw createError ?? new Error("Unable to create E2E user");
  }

  const { data: users, error: listError } =
    await supabase.auth.admin.listUsers();
  if (listError) throw listError;
  const user = users.users.find((candidate) => candidate.email === email);
  if (!user) throw new Error("E2E user was not found after creation failed");
  return user.id;
}

const userId = await findOrCreateUser();
const { data: existingMonitor } = await supabase
  .from("monitors")
  .select("id")
  .eq("user_id", userId)
  .eq("name", "E2E Monitor")
  .maybeSingle();

let monitorId = existingMonitor?.id as string | undefined;
if (!monitorId) {
  const { data: monitor, error } = await supabase
    .from("monitors")
    .insert({
      user_id: userId,
      name: "E2E Monitor",
      type: "http",
      url: "https://example.com",
      active: false,
    })
    .select("id")
    .single();
  if (error) throw error;
  monitorId = monitor.id as string;
}

const { data: existingPage } = await supabase
  .from("status_pages")
  .select("id")
  .eq("slug", statusSlug)
  .maybeSingle();

let statusPageId = existingPage?.id as string | undefined;
if (!statusPageId) {
  const { data: page, error } = await supabase
    .from("status_pages")
    .insert({
      user_id: userId,
      slug: statusSlug,
      title: "E2E Status Page",
      description: "Seeded by the delivery test suite",
      is_public: true,
    })
    .select("id")
    .single();
  if (error) throw error;
  statusPageId = page.id as string;
}

const { error: deleteError } = await supabase
  .from("status_page_monitors")
  .delete()
  .eq("status_page_id", statusPageId);
if (deleteError) throw deleteError;

const { error: linkError } = await supabase
  .from("status_page_monitors")
  .insert({
    status_page_id: statusPageId,
    monitor_id: monitorId,
    display_order: 0,
  });
if (linkError) throw linkError;

console.info(`E2E fixture ready: ${email} / ${statusSlug}`);
