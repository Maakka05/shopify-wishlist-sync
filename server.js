import express from "express";
import fetch from "node-fetch";
import bodyParser from "body-parser";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

// --- INITIALIZE EXPRESS APP ---
const app = express();
app.use(bodyParser.json());

// --- CORS SETUP (✅ only one clean version) ---
const allowedOrigin = process.env.CORS_ORIGIN || "*";
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests from your Shopify store domain(s)
    if (!origin) return callback(null, true);
    const allowed = allowedOrigin.split(",").map(o => o.trim());
    if (allowed.includes(origin)) return callback(null, true);
    return callback(new Error("CORS not allowed for this origin: " + origin));
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "X-MAAKKA-SECRET"],
  credentials: false
}));

// --- ENVIRONMENT VARIABLES ---
const SHOPIFY_STORE = process.env.SHOPIFY_STORE; // e.g. maakka.myshopify.com
const SHOPIFY_ADMIN_API_ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN;
const FRONTEND_SECRET = process.env.FRONTEND_SECRET || "maakka-secret-2025"; // must match your frontend header

// --- SECURITY: VERIFY FRONTEND SECRET ---
function checkSecret(req, res, next) {
  const secret = req.get("X-MAAKKA-SECRET") || "";
  if (!FRONTEND_SECRET || secret !== FRONTEND_SECRET) {
    return res.status(403).json({ error: "Forbidden - invalid secret" });
  }
  next();
}

// --- HEALTH CHECK ---
app.get("/", (req, res) => res.send("✅ MAAKKA Wishlist Sync Running"));

// --- GET WISHLIST FOR CUSTOMER ---
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
      const txt = await resp.text();
      console.error("GET metafields error:", txt);
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

// --- UPDATE / CREATE WISHLIST FOR CUSTOMER ---
app.post("/apps/wishlist-sync", checkSecret, async (req, res) => {
  try {
    const { customer_id, product_ids } = req.body;
    if (!customer_id) return res.status(400).json({ error: "Missing customer_id" });

    const payload = {
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
        body: JSON.stringify(payload)
      }
    );

    if (!resp.ok) {
      const txt = await resp.text();
      console.error("POST metafield error:", txt);
      return res.status(500).json({ error: "Failed to update metafield" });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("POST wishlist error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// --- START SERVER ---
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Wishlist Sync Server running on port ${PORT}`));
