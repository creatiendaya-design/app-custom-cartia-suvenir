import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import sharp from "sharp";

test.beforeEach(async ({ page }) => {
  page.on("pageerror", (error) =>
    console.error("Browser error:", error.message),
  );
});

test("merchant uploads, replaces and restores a canvas photograph across dashboard and customer editor", async ({
  page,
}) => {
  const first = await sharp({
    create: { width: 800, height: 600, channels: 3, background: "#e1b365" },
  })
    .png()
    .toBuffer();
  const second = await sharp({
    create: { width: 600, height: 800, channels: 3, background: "#528096" },
  })
    .webp()
    .toBuffer();
  await page.goto("/app?tab=catalog");
  await page
    .getByRole("article")
    .filter({
      has: page.getByRole("heading", {
        name: "Termo personalizado",
        exact: true,
      }),
    })
    .getByRole("button", { name: "Usar plantilla", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("button", { name: "Subir imagen del lienzo" }),
  ).toBeInViewport();
  await dialog
    .getByLabel("Nombre del personalizador")
    .fill("Termo con fotografía");
  await dialog.getByLabel("Imagen del lienzo", { exact: true }).setInputFiles({
    name: "mi-termo.png",
    mimeType: "image/png",
    buffer: first,
  });
  await expect(
    dialog.getByRole("button", { name: "Cambiar imagen del lienzo" }),
  ).toBeEnabled();
  const photo = dialog.locator("svg.product-scene > image");
  await expect(photo).toHaveAttribute("href", /\/api\/canvas\?/);
  const firstUrl = (await photo.getAttribute("href"))!;
  expect((await page.request.get(firstUrl)).status()).toBe(200);
  await dialog.getByLabel("Ajuste de la imagen").selectOption("cover");
  await expect(photo).toHaveAttribute("preserveAspectRatio", "xMidYMid slice");
  await dialog.getByLabel("Activar personalizador", { exact: true }).check();
  await dialog
    .getByRole("button", { name: "Crear personalizador", exact: true })
    .click();
  await expect(dialog).toBeHidden();
  const row = page.getByRole("article", {
    name: "Termo con fotografía",
    exact: true,
  });
  const studioPath = (await row
    .getByRole("link", { name: "Vista previa de Termo con fotografía" })
    .getAttribute("href"))!;
  await page.goto(studioPath);
  await expect(page.locator("svg.interactive > image")).toHaveAttribute(
    "href",
    firstUrl,
  );
  await page.goto("/app");
  await row
    .getByRole("button", { name: "Configurar Termo con fotografía" })
    .click();
  await expect(dialog.getByLabel("Ajuste de la imagen")).toHaveValue("cover");
  await dialog.getByLabel("Imagen del lienzo", { exact: true }).setInputFiles({
    name: "otro-termo.webp",
    mimeType: "image/webp",
    buffer: second,
  });
  await expect(
    dialog.getByText("otro-termo.webp", { exact: true }),
  ).toBeVisible();
  const secondUrl = (await photo.getAttribute("href"))!;
  expect(secondUrl).not.toBe(firstUrl);
  await dialog
    .getByRole("button", { name: "Guardar configuración", exact: true })
    .click();
  await expect(dialog).toBeHidden();
  await page.reload();
  await row
    .getByRole("button", { name: "Configurar Termo con fotografía" })
    .click();
  await expect(photo).toHaveAttribute("href", secondUrl);
  mkdirSync("output/previews", { recursive: true });
  await page.screenshot({
    path: "output/previews/lienzo-propio.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    dialog.getByRole("button", { name: "Cambiar imagen del lienzo" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await dialog
    .getByRole("button", { name: "Restaurar imagen de plantilla" })
    .click();
  await expect(photo).toHaveCount(0);
  await dialog
    .getByRole("button", { name: "Guardar configuración", exact: true })
    .click();
  await expect(dialog).toBeHidden();
  await page.goto(studioPath);
  await expect(
    page.getByRole("heading", { name: "Termo con fotografía", exact: true }),
  ).toBeVisible();
  await expect(page.locator("svg.interactive > image")).toHaveCount(0);
  expect((await page.request.get(firstUrl)).status()).toBe(200);
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

test("merchant creates a reusable personalizer, assigns two products and keeps variant drafts separate", async ({
  page,
}) => {
  await page.goto("/app");
  await page
    .getByRole("button", { name: "Crear personalizador", exact: true })
    .click();
  const template = page.getByRole("article").filter({
    has: page.getByRole("heading", { name: "Gorra con parche", exact: true }),
  });
  await template
    .getByRole("button", { name: "Usar plantilla", exact: true })
    .click();
  const name = `Gorras para empresas ${Date.now()}`;
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nombre del personalizador").fill(name);
  await dialog
    .getByRole("button", { name: "Asignar productos", exact: true })
    .click();
  dialog = page.getByRole("dialog", { name: "Asignar productos", exact: true });
  await dialog
    .getByRole("checkbox", { name: "Asignar Gorra de empresa", exact: true })
    .check();
  await dialog.getByLabel("Buscar productos de Shopify").fill("eventos");
  await dialog
    .getByRole("checkbox", { name: "Asignar Gorra para eventos", exact: true })
    .check();
  await expect(dialog).toContainText("2 productos seleccionados");
  await page.screenshot({
    path: "output/previews/asignar-productos.png",
    fullPage: true,
  });
  await dialog
    .getByRole("button", { name: "Guardar asignación", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("2 productos seleccionados");
  await dialog.getByLabel("Activar personalizador", { exact: true }).check();
  await dialog
    .getByRole("button", { name: "Crear personalizador", exact: true })
    .click();
  const row = page.getByRole("article", { name, exact: true });
  await expect(row).toContainText("2 productos asignados");
  await expect(row).toContainText("Activo");
  await page.reload();
  const preview = await row
    .getByRole("link", { name: `Vista previa de ${name}`, exact: true })
    .getAttribute("href");
  const path = preview!.split("?")[0];
  await page.screenshot({
    path: "output/previews/personalizadores.png",
    fullPage: true,
  });
  await page.goto(`${path}?variant=1201&product=1002`);
  await expect(
    page.getByRole("heading", { name: "Gorra para eventos", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Tu texto").fill("Evento corporativo");
  await page
    .getByRole("button", { name: "Guardar diseño", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Guardado");
  await page.goto(`${path}?variant=1101&product=1001`);
  await expect(
    page.getByRole("heading", { name: "Gorra de empresa", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Tu texto")).not.toHaveValue(
    "Evento corporativo",
  );
  await page.goto(`${path}?variant=1201&product=1002`);
  await expect(page.getByLabel("Tu texto")).toHaveValue("Evento corporativo");
  await page.goto("/app");
  await row
    .getByRole("button", { name: "Asignar productos", exact: true })
    .click();
  dialog = page.getByRole("dialog", { name: "Asignar productos", exact: true });
  await dialog
    .getByRole("button", { name: "Quitar Gorra de empresa", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Quitar Gorra para eventos", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Guardar asignación", exact: true })
    .click();
  await expect(row).toContainText("0 productos asignados");
  await expect(row.getByRole("switch")).not.toBeChecked();
});

test("assignment selector works on mobile and can close with Escape", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app");
  const row = page.getByRole("article", {
    name: "Gorra con parche",
    exact: true,
  });
  await row
    .getByRole("button", { name: "Asignar productos", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Asignar productos",
    exact: true,
  });
  await expect(
    dialog.getByRole("checkbox", {
      name: "Asignar Gorra de empresa",
      exact: true,
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "output/previews/asignar-productos-mobile.png",
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
});
