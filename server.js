import express from "express";
import fetch from "node-fetch";
import bodyParser from "body-parser";
import dotenv from "dotenv";

dotenv.config();
const app = express();
app.use(bodyParser.json());

// --- CONFIG (from Render env vars) ---
const SHOPIFY_STORE = process.env.SHOPIFY_STORE; // e.g. maakka.myshopify.com
const SHOPIFY_ADMIN_API_ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN;
const FRONTEND_SECRET = process.env.FRONTEND_SECRET || ""; // must match client's header
const SHOP_ORIGIN = process.env.SHOP_ORIGIN || `https://${SHOPIFY_STORE}`; // allowed origin

// Basic CORS: allow only your shop origin
app.use((req, res, next) => {
  const origin = req.get('origin');
  if (origin && origin.startsWith(SHOP_ORIGIN)) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, X-MAAKKA-SECRET");
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// Secret-check middleware
function checkSecret(req, res, next) {
  const secret = req.get('X-MAAKKA-SECRET') || "";
  if (!FRONTEND_SECRET || secret !== FRONTEND_SECRET) {
    return res.status(403).json({ error: "Forbidden - invalid secret" });
  }
  next();
}

// Health
app.get("/", (req, res) => res.send("MAAKKA Wishlist Sync Running ✅"));

// GET wishlist for a customer (protected)
app.get("/apps/wishlist-sync", checkSecret, async (req, res) => {
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

    if (!resp.ok) {
      const t = await resp.text();
      console.error("GET metafields error:", t);
      return res.status(500).json({ error: "Failed to read metafields" });
    }

    const data = await resp.json();
    const wishlistField = (data.metafields || []).find(
      mf => mf.namespace === "custom" && mf.key === "wishlist_product_ids"
    );

    const wishlist = wishlistField ? JSON.parse(wishlistField.value) : [];
    res.json({ product_ids: wishlist });
  } catch (err) {
    console.error("GET wishlist error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// POST update wishlist (protected)
app.post("/apps/wishlist-sync", checkSecret, async (req, res) => {
  try {
    const { customer_id, product_ids } = req.body;
    if (!customer_id) return res.status(400).json({ error: "Missing customer_id" });

    // Create metafield payload
    const payload = {
      metafield: {
        namespace: "custom",
        key: "wishlist_product_ids",
        type: "json",
        value: JSON.stringify(product_ids || [])
      }
    };

    // POST to create metafield (Shopify will create or return error if exists; simpler approach)
    const resp = await fetch(
      `https://${SHOPIFY_STORE}/admin/api/2025-01/customers/${customer_id}/metafields.json`,
      {
        method: "POST",
        headers: {
          "X-Shopify-Access-Token": SHOPIFY_ADMIN_API_ACCESS_TOKEN,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      }
    );

    if (!resp.ok) {
      const text = await resp.text();
      console.error("Create/update metafield error:", text);
      return res.status(500).json({ error: "Failed to update metafield" });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("POST wishlist error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Wishlist Sync Server running on port ${PORT}`));

