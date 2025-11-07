import express from "express";
import fetch from "node-fetch";
import bodyParser from "body-parser";
import dotenv from "dotenv";

dotenv.config();
const app = express();
app.use(bodyParser.json());

const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
const SHOPIFY_ADMIN_API_ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN;

// ✅ Fetch customer's wishlist metafield
app.get("/apps/wishlist-sync", async (req, res) => {
  try {
    const customerId = req.query.customer_id;
    if (!customerId) return res.status(400).json({ error: "Missing customer_id" });

    const resp = await fetch(
      `https://${SHOPIFY_STORE}/admin/api/2025-01/customers/${customerId}/metafields.json`,
      {
        headers: {
          "X-Shopify-Access-Token": SHOPIFY_ADMIN_API_ACCESS_TOKEN,
          "Content-Type": "application/json"
        }
      }
    );

    const data = await resp.json();
    const wishlistField = data.metafields.find(
      mf => mf.namespace === "custom" && mf.key === "wishlist_product_ids"
    );

    const wishlist = wishlistField ? JSON.parse(wishlistField.value) : [];
    res.json({ product_ids: wishlist });
  } catch (err) {
    console.error("GET wishlist error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ✅ Update customer's wishlist metafield
app.post("/apps/wishlist-sync", async (req, res) => {
  try {
    const { customer_id, product_ids } = req.body;
    if (!customer_id) return res.status(400).json({ error: "Missing customer_id" });

    const metafieldPayload = {
      metafield: {
        namespace: "custom",
        key: "wishlist_product_ids",
        type: "json",
        value: JSON.stringify(product_ids || [])
      }
    };

    const resp = await fetch(
      `https://${SHOPIFY_STORE}/admin/api/2025-01/customers/${customer_id}/metafields.json`,
      {
        method: "POST",
        headers: {
          "X-Shopify-Access-Token": SHOPIFY_ADMIN_API_ACCESS_TOKEN,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(metafieldPayload)
      }
    );

    if (!resp.ok) {
      const text = await resp.text();
      console.error("Update error:", text);
      return res.status(400).json({ error: "Failed to update metafield" });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("POST wishlist error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Health check
app.get("/", (req, res) => res.send("MAAKKA Wishlist Sync Running ✅"));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Wishlist Sync Server running on port ${PORT}`));
