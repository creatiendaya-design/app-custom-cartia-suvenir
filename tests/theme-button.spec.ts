import { expect, test } from "@playwright/test";

const appUrl = "https://app-custom-cartia-suvenir.onrender.com";

test("the real theme script adds the signed variant to the cart from a custom storefront domain", async ({
  page,
}) => {
  const store = "https://souvenirmade.shop";
  let cartBody: unknown;
  await page.route(`${store}/cart/add.js`, async (route) => {
    cartBody = route.request().postDataJSON();
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ items: [{ id: "51212783812665" }] }),
    });
  });
  await page.route(`${store}/cart`, (route) =>
    route.fulfill({ contentType: "text/html", body: "<h1>Carrito</h1>" }),
  );
  await page.route(`${store}/theme-test`, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `
    <section><form action="/cart/add"><input name="id" value="51212783812665" type="hidden"></form>
      <div data-sm-personalizer data-app-url="" data-product-key="auto" data-shop="souvenir-made-xbc1wrvr.myshopify.com" data-shopify-product-id="10454799351865" data-variant-id="51212783812665">
        <button class="sm-personalizer__open">Personalizar este producto</button><p role="alert" hidden></p>
        <dialog><button class="sm-personalizer__close">Cerrar</button><iframe title="Editor"></iframe></dialog>
      </div>
    </section>`,
    }),
  );
  const item = {
    id: "51212783812665",
    quantity: 2,
    properties: {
      Personalización: "Diseño de prueba",
      _sm_design_id: "test-design",
      _sm_revision: "1",
      _sm_signature: "a".repeat(64),
    },
  };
  await page.route(`${appUrl}/studio/**`, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<meta charset="utf-8"><button id="purchase">Añadir al carrito</button><script>document.getElementById('purchase').onclick=()=>parent.postMessage(${JSON.stringify({ type: "souvenir:add-to-cart", item })},'${store}')</script>`,
    }),
  );
  await page.goto(`${store}/theme-test`);
  await page.addScriptTag({
    path: "extensions/souvenir-personalizer/assets/personalizer.js",
  });
  await page
    .getByRole("button", { name: "Personalizar este producto" })
    .click();
  await page
    .frameLocator("iframe")
    .getByRole("button", { name: "Añadir al carrito" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Carrito", exact: true }),
  ).toBeVisible();
  expect(cartBody).toEqual({ items: [item] });
});

test("the storefront button opens its assigned product even when the optional app URL is empty", async ({
  page,
}) => {
  await page.route(`${appUrl}/**`, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<h1>Editor del producto</h1>",
    }),
  );
  await page.setContent(`
    <section>
      <form action="/cart/add"><input type="hidden" name="id" value="51212783812665"></form>
      <div data-sm-personalizer data-app-url="" data-product-key="auto"
        data-shop="souvenir-made-xbc1wrvr.myshopify.com"
        data-shopify-product-id="10454799351865" data-variant-id="111">
        <button class="sm-personalizer__open">Personalizar este producto</button>
        <p role="alert" hidden></p>
        <dialog><button class="sm-personalizer__close">Cerrar</button><iframe title="Editor"></iframe></dialog>
      </div>
    </section>
  `);
  await page.addScriptTag({
    path: "extensions/souvenir-personalizer/assets/personalizer.js",
  });
  await page
    .getByRole("button", { name: "Personalizar este producto" })
    .click();
  await expect(page.locator("dialog")).toBeVisible();
  await expect(page.getByRole("alert")).toBeHidden();
  const frameUrl = new URL(
    (await page.locator("iframe").getAttribute("src")) || "about:blank",
  );
  expect(frameUrl.origin).toBe(appUrl);
  expect(frameUrl.pathname).toBe("/studio/auto");
  expect(frameUrl.searchParams.get("product")).toBe("10454799351865");
  expect(frameUrl.searchParams.get("variant")).toBe("51212783812665");
  expect(frameUrl.searchParams.get("shop")).toBe(
    "souvenir-made-xbc1wrvr.myshopify.com",
  );
  await expect(page.frameLocator("iframe").getByRole("heading")).toHaveText(
    "Editor del producto",
  );
  await page.getByRole("button", { name: "Cerrar", exact: true }).click();
  await expect(page.locator("dialog")).toBeHidden();
  await page
    .getByRole("button", { name: "Personalizar este producto" })
    .click();
  await expect(page.locator("dialog")).toBeVisible();
});
