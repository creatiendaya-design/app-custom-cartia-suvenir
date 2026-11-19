(() => {
  function initialize() {
    document
      .querySelectorAll("[data-sm-personalizer]:not([data-sm-ready])")
      .forEach((block) => {
        block.setAttribute("data-sm-ready", "true");
        const dialog = block.querySelector("dialog");
        const frame = block.querySelector("iframe");
        const error = block.querySelector('[role="alert"]');
        const open = block.querySelector(".sm-personalizer__open");
        let appOrigin = "",
          variantId = "",
          submitting = false;
        const showError = (message) => {
          error.textContent = message;
          error.hidden = false;
        };
        open.addEventListener("click", () => {
          error.hidden = true;
          try {
            const base = new URL(block.dataset.appUrl);
            if (
              base.protocol !== "https:" ||
              !/^[a-z0-9-]+$/.test(block.dataset.productKey)
            )
              throw new Error();
            appOrigin = base.origin;
            const variantInput =
              block
                .closest("section")
                ?.querySelector('form[action*="/cart/add"] [name="id"]') ||
              document.querySelector('form[action*="/cart/add"] [name="id"]');
            variantId = String(variantInput?.value || block.dataset.variantId);
            const url = new URL(`/studio/${block.dataset.productKey}`, base);
            url.searchParams.set("shop", block.dataset.shop);
            url.searchParams.set("variant", variantId);
            if (block.dataset.shopifyProductId)
              url.searchParams.set("product", block.dataset.shopifyProductId);
            frame.src = url.href;
            dialog.showModal();
          } catch {
            showError(
              "El personalizador todavía no está configurado para este producto. Contacta con la tienda.",
            );
          }
        });
        block
          .querySelector(".sm-personalizer__close")
          .addEventListener("click", () => dialog.close());
        dialog.addEventListener("click", (event) => {
          if (event.target === dialog) dialog.close();
        });
        window.addEventListener("message", async (event) => {
          if (
            !dialog.open ||
            event.source !== frame.contentWindow ||
            event.origin !== appOrigin ||
            event.data?.type !== "souvenir:add-to-cart" ||
            submitting
          )
            return;
          const item = event.data.item;
          if (
            !item ||
            String(item.id) !== variantId ||
            !Number.isInteger(item.quantity) ||
            item.quantity < 1 ||
            item.quantity > 1000
          )
            return;
          const keys = [
            "Personalización",
            "_sm_design_id",
            "_sm_revision",
            "_sm_signature",
          ];
          if (
            !keys.every(
              (key) =>
                typeof item.properties?.[key] === "string" &&
                item.properties[key].length <= 200,
            )
          )
            return;
          const properties = Object.fromEntries(
            keys.map((key) => [key, item.properties[key]]),
          );
          submitting = true;
          try {
            const response = await fetch(
              `${window.Shopify?.routes?.root || "/"}cart/add.js`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  items: [
                    { id: variantId, quantity: item.quantity, properties },
                  ],
                }),
              },
            );
            const result = await response.json();
            if (!response.ok)
              throw new Error(
                result.description ||
                  "No se pudo añadir el producto al carrito.",
              );
            window.location.assign(
              `${window.Shopify?.routes?.root || "/"}cart`,
            );
          } catch (failure) {
            frame.contentWindow.postMessage(
              {
                type: "souvenir:cart-error",
                message:
                  failure.message || "Revisa el carrito y vuelve a intentarlo.",
              },
              appOrigin,
            );
          } finally {
            submitting = false;
          }
        });
      });
  }
  initialize();
  document.addEventListener("shopify:section:load", initialize);
})();
