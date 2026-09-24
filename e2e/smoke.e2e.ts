import { expect, test } from "@playwright/test";

test("renders the public landing page", async ({ page }) => {
  const response = await page.goto("/");

  expect(response?.status()).toBe(200);
  await expect(
    page.getByRole("heading", { name: /Downtime happens/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Go to Dashboard" }).first(),
  ).toBeVisible();
});

test("renders the sign-in form without a session", async ({ page }) => {
  await page.goto("/login");

  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeEnabled();
});

test("keeps the cron health endpoint public", async ({ request }) => {
  const response = await request.get("/api/cron/check-monitors?health=true");

  expect(response.status()).toBe(200);
  await expect(response.json()).resolves.toMatchObject({ status: "healthy" });
});

test("rejects unauthenticated cron mutations", async ({ request }) => {
  const postResponse = await request.post("/api/cron/check-monitors");
  const getResponse = await request.get("/api/cron/check-monitors");

  expect(postResponse.status()).toBe(401);
  expect(getResponse.status()).toBe(401);
});

test("rejects unauthenticated application API reads", async ({ request }) => {
  const channelsResponse = await request.get("/api/notifications/channels");
  const statusPagesResponse = await request.get("/api/status-pages");
  const scheduleResponse = await request.get("/api/settings/schedule");

  expect(channelsResponse.status()).toBe(401);
  expect(statusPagesResponse.status()).toBe(401);
  expect(scheduleResponse.status()).toBe(401);
});

test("signs in and reaches the dashboard when test credentials are provided", async ({
  page,
}) => {
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;
  if (process.env.CI && (!email || !password)) {
    throw new Error("CI requires E2E_EMAIL and E2E_PASSWORD");
  }
  test.skip(
    !email || !password,
    "E2E_EMAIL and E2E_PASSWORD are not configured",
  );

  await page.goto("/login");
  await page.getByLabel("Email").fill(email!);
  await page.getByLabel("Password").fill(password!);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/dashboard/);
});

test("renders a configured public status page", async ({ page }) => {
  const slug = process.env.E2E_PUBLIC_STATUS_SLUG;
  if (process.env.CI && !slug) {
    throw new Error("CI requires E2E_PUBLIC_STATUS_SLUG");
  }
  test.skip(!slug, "E2E_PUBLIC_STATUS_SLUG is not configured");

  const response = await page.goto(`/status/${slug}`);

  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: /status/i })).toBeVisible();
});
