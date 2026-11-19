import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";

test.beforeEach(async ({ page }) => {
  page.on("pageerror", (error) =>
    console.error("Browser error:", error.message),
  );
});

test("Shopify launch opens the dashboard and retains its embedded context", async ({
  page,
}) => {
  const params = new URLSearchParams({
    shop: "souvenir-made-xbc1wrvr.myshopify.com",
    embedded: "1",
    host: Buffer.from(
      "admin.shopify.com/store/souvenir-made-xbc1wrvr",
    ).toString("base64"),
  });
  await page.goto(`/?${params}`);
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === "/app" &&
      url.searchParams.get("host") === params.get("host") &&
      url.searchParams.get("embedded") === "1",
  );
  await expect(
    page.getByRole("button", {
      name: "Configurar Gorra con parche",
      exact: true,
    }),
  ).toBeVisible();
});

test("customer edits, saves, reloads and submits a design for workshop review", async ({
  page,
}) => {
  await page.goto("/studio/cap-patch");
  await expect(
    page.getByRole("heading", { name: "Gorra con parche", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Tu texto").fill("Recuerdos de Ana");
  await page
    .getByRole("button", { name: "Guardar diseño", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Guardado");
  await page.reload();
  await expect(page.getByLabel("Tu texto")).toHaveValue("Recuerdos de Ana");
  mkdirSync("output/previews", { recursive: true });
  await page.screenshot({ path: "output/previews/editor.png", fullPage: true });
  await page
    .getByRole("button", { name: "Revisar diseño", exact: true })
    .click();
  await page
    .getByLabel("Confirmo que el texto y la distribución son correctos")
    .check();
  await page
    .getByRole("button", { name: "Enviar al taller", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Enviado al taller");
  await page.goto("/app?tab=designs");
  await expect(
    page.getByRole("cell", { name: "En revisión", exact: true }).first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /Abrir diseño/ })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Aprobar diseño", exact: true })
    .click();
  await expect(
    page.getByRole("cell", { name: "Aprobado", exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Autorizar producción", exact: true }),
  ).toBeDisabled();
});

test("merchant can configure a real area and persist it", async ({ page }) => {
  await page.goto("/app");
  await page
    .getByRole("button", { name: "Configurar Gorra con parche", exact: true })
    .click();
  await page.getByLabel("Ancho del área (mm)").fill("85");
  await page
    .getByRole("button", { name: "Guardar configuración", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Configuración guardada",
  );
  await page.reload();
  await page
    .getByRole("button", { name: "Configurar Gorra con parche", exact: true })
    .click();
  await expect(page.getByLabel("Ancho del área (mm)")).toHaveValue("85");
});

test("editor is usable on a narrow screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/studio/cap-patch");
  await expect(page.getByLabel("Tu texto")).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Revisar diseño", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "output/previews/editor-mobile.png",
    fullPage: true,
  });
});
