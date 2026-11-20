const path = require("path");
const crypto = require("crypto");
const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;
const API_SECRET = process.env.API_SECRET || "AITUM_SECRET_KEY_2026";

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const deliveryQueue = [];
const processedOrderIds = new Set();

function verifyRobloxSecret(req, res, next) {
  const key = req.headers["x-aitum-key"];
  if (!key || key !== API_SECRET) {
    return res.status(401).json({ ok: false, error: "Invalid x-aitum-key" });
  }
  next();
}

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "AI Tum TOWN Roblox Bridge API",
    pendingCount: deliveryQueue.filter((o) => o.status === "Pending").length,
    totalOrders: deliveryQueue.length,
  });
});

app.get("/api/roblox/verify-user/:userId", async (req, res) => {
  const userId = String(req.params.userId || "").trim();
  if (!/^\d+$/.test(userId)) {
    return res.status(400).json({ ok: false, error: "UserId ต้องเป็นตัวเลขเท่านั้น" });
  }

  try {
    const userRes = await fetch(`https://users.roblox.com/v1/users/${userId}`);
    if (!userRes.ok) {
      return res.status(404).json({ ok: false, error: "ไม่พบผู้เล่น Roblox UserId นี้" });
    }
    const userData = await userRes.json();

    let avatarUrl = "";
    try {
      const thumbRes = await fetch(
        `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=false`
      );
      if (thumbRes.ok) {
        const thumbData = await thumbRes.json();
        avatarUrl = thumbData?.data?.[0]?.imageUrl || "";
      }
    } catch (_) {}

    res.json({
      ok: true,
      userId: String(userData.id),
      username: userData.name,
      displayName: userData.displayName,
      avatarUrl,
    });
  } catch (_) {
    res.status(500).json({ ok: false, error: "เชื่อมต่อ Roblox API ไม่สำเร็จ" });
  }
});

app.post("/api/roblox/enqueue", (req, res) => {
  const { orderId, userId, username, itemCode, itemName, amount } = req.body || {};

  if (!userId || !itemCode) {
    return res.status(400).json({ ok: false, error: "ข้อมูล userId หรือ itemCode ไม่ครบ" });
  }

  const finalOrderId = orderId || `ORD-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
  const exists = deliveryQueue.find((o) => o.orderId === finalOrderId);
  if (exists) {
    return res.json({ ok: true, order: exists, duplicate: true });
  }

  const newOrder = {
    orderId: String(finalOrderId),
    userId: String(userId).trim(),
    username: String(username || ""),
    itemCode: String(itemCode).trim(),
    itemName: String(itemName || itemCode),
    amount: Math.max(1, Number(amount) || 1),
    status: "Pending",
    createdAt: Date.now(),
    deliveredAt: null,
  };

  deliveryQueue.push(newOrder);
  res.json({ ok: true, order: newOrder });
});

app.post("/api/roblox/pending", verifyRobloxSecret, (req, res) => {
  const userIds = Array.isArray(req.body?.userIds) ? req.body.userIds.map(String) : [];
  if (userIds.length === 0) {
    return res.json({ ok: true, orders: [] });
  }

  const matchedOrders = deliveryQueue.filter(
    (order) =>
      order.status === "Pending" &&
      !processedOrderIds.has(order.orderId) &&
      userIds.includes(order.userId)
  );

  res.json({ ok: true, orders: matchedOrders });
});

app.post("/api/roblox/confirm", verifyRobloxSecret, (req, res) => {
  const orderIds = Array.isArray(req.body?.orderIds) ? req.body.orderIds.map(String) : [];
  let updated = 0;

  for (const id of orderIds) {
    processedOrderIds.add(id);
    const target = deliveryQueue.find((o) => o.orderId === id);
    if (target && target.status !== "Delivered") {
      target.status = "Delivered";
      target.deliveredAt = Date.now();
      updated++;
    }
  }

  res.json({ ok: true, updated });
});

app.get("/api/roblox/status/:userId", (req, res) => {
  const userId = String(req.params.userId || "").trim();
  const orders = deliveryQueue.filter((o) => o.userId === userId);
  res.json({ ok: true, orders });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`AI Tum TOWN Server running on port ${PORT}`);
});