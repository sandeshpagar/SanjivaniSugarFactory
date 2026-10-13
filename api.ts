import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import OpenAI from "openai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// 1. PostgreSQL Connection
const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgresql://postgres:postgres@localhost:5432/sanjivani_db",
});

// 2. OpenAI Client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// MCP Tool Definition for OpenAI
const mcpTools = [
  {
    type: "function" as const,
    function: {
      name: "get_farmers_data",
      description:
        "Fetch real sugarcane farmers data from Sanjivani factory database. Can filter by village or return all records.",
      parameters: {
        type: "object",
        properties: {
          village: {
            type: "string",
            description:
              "Optional village name to filter farmers (e.g. Kopargaon, Shirdi, Rahata, Puntamba, Kolpewadi)",
          },
        },
      },
    },
  },
];

// Tool executor function (simulates the MCP Server Tool handler directly against Postgres)
async function executeMcpTool(name: string, args: { village?: string }) {
  if (name === "get_farmers_data") {
    const query = args.village
      ? "SELECT * FROM farmers WHERE LOWER(village) = LOWER($1) ORDER BY id ASC"
      : "SELECT * FROM farmers ORDER BY id ASC";
    const values = args.village ? [args.village] : [];
    const res = await pool.query(query, values);
    return JSON.stringify(res.rows, null, 2);
  }
  throw new Error(`Unknown tool: ${name}`);
}

// ======================== API ROUTES ========================

// 1. GET /api/farmers (with optional ?village= & ?q=)
app.get("/api/farmers", async (req, res) => {
  try {
    const { village, q } = req.query;
    let query = "SELECT * FROM farmers WHERE 1=1";
    const values: any[] = [];

    if (village && village !== "all") {
      values.push(village);
      query += ` AND LOWER(village) = LOWER($${values.length})`;
    }

    if (q) {
      values.push(`%${q}%`);
      query += ` AND (LOWER(name) LIKE LOWER($${values.length}) OR LOWER(village) LIKE LOWER($${values.length}))`;
    }

    query += " ORDER BY id ASC";

    const result = await pool.query(query, values);
    res.json({ farmers: result.rows });
  } catch (err: any) {
    console.error("Error fetching farmers:", err);
    res.status(500).json({ error: err.message });
  }
});

// 2. GET /api/stats (Real calculation from DB)
app.get("/api/stats", async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        COUNT(*)::int as total_farmers,
        COALESCE(SUM(sugarcane_supply_tons), 0)::float as total_tons,
        COALESCE(SUM(total_amount), 0)::float as total_amount,
        COALESCE(SUM(amount_paid), 0)::float as amount_paid,
        COALESCE(SUM(payment_pending), 0)::float as payment_pending,
        COUNT(CASE WHEN payment_pending > 0 THEN 1 END)::int as pending_farmers_count,
        COUNT(CASE WHEN payment_pending = 0 THEN 1 END)::int as fully_paid_farmers_count
      FROM farmers
    `);

    const stats = result.rows[0];
    const paidPercentage =
      stats.total_amount > 0
        ? ((stats.amount_paid / stats.total_amount) * 100).toFixed(1)
        : "0.0";

    res.json({
      ...stats,
      paid_percentage: parseFloat(paidPercentage),
      crushing_day: 84,
      frp_rate_per_ton: 3000,
    });
  } catch (err: any) {
    console.error("Error fetching stats:", err);
    res.status(500).json({ error: err.message });
  }
});

// 3. GET /api/weighbridge (Generates realistic live weighbridge slips from farmers data)
app.get("/api/weighbridge", async (_req, res) => {
  try {
    const farmersRes = await pool.query("SELECT * FROM farmers ORDER BY id ASC");
    const slips = farmersRes.rows.map((f, i) => {
      const netTons = parseFloat(f.sugarcane_supply_tons);
      const tareTons = 4.2 + (i % 3) * 0.4;
      const grossTons = (netTons + tareTons).toFixed(2);
      const vehicleNum = `MH-17-AG-${1000 + f.id * 142}`;
      const slipId = `WB-2025-${(8000 + f.id).toString()}`;
      const brix = (10.5 + ((f.id * 3) % 15) * 0.1).toFixed(1);
      const moisture = (9.2 + ((f.id * 2) % 10) * 0.1).toFixed(1);

      return {
        slip_id: slipId,
        farmer_id: f.id,
        farmer_name: f.name,
        village: f.village,
        vehicle_no: vehicleNum,
        gross_tons: parseFloat(grossTons),
        tare_tons: tareTons,
        net_tons: netTons,
        brix_percentage: parseFloat(brix),
        moisture_percentage: parseFloat(moisture),
        status: f.payment_pending == 0 ? "Verified & Settled" : "Weighed & Approved",
        timestamp: new Date(Date.now() - i * 3600000 * 4).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };
    });

    res.json({ slips });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 4. POST /api/copilot (Real AI Copilot via MCP Tool Execution + OpenAI)
app.post("/api/copilot", async (req, res) => {
  try {
    const { question } = req.body;
    if (!question) {
      return res.status(400).json({ error: "question is required" });
    }

    const startTime = Date.now();

    // Ask OpenAI with tool definition
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are Sanjivani Sugar Factory AI Copilot (Kopargaon). You assist factory managers and farmers with sugarcane delivery, tonnage, FRP rates, and payment accounts. Always use the get_farmers_data tool to fetch real database records before answering inquiries about farmers, villages, or balances.",
        },
        { role: "user", content: question },
      ],
      tools: mcpTools,
    });

    const responseMessage = completion.choices[0].message;
    let toolInvocationData: any = null;
    let finalAnswer = responseMessage.content || "";

    // If tool was called
    if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
      const toolCall = responseMessage.tool_calls[0];
      const toolArgs = JSON.parse(toolCall.function.arguments || "{}");

      const toolStart = Date.now();
      const toolResultText = await executeMcpTool(toolCall.function.name, toolArgs);
      const toolDuration = Date.now() - toolStart;

      toolInvocationData = {
        name: toolCall.function.name,
        args: toolArgs,
        durationMs: toolDuration,
      };

      // Get final answer from OpenAI with tool result
      const finalCompletion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are Sanjivani Sugar Factory AI Copilot. Summarize the farmer records clearly with exact rupees (₹) and tonnage figures, highlight pending payments, and provide factory management recommendations.",
          },
          { role: "user", content: question },
          responseMessage,
          {
            role: "tool",
            tool_call_id: toolCall.id,
            content: toolResultText,
          },
        ],
      });

      finalAnswer = finalCompletion.choices[0].message.content || "";
    }

    const totalDuration = Date.now() - startTime;

    res.json({
      question,
      answer: finalAnswer,
      toolInvocation: toolInvocationData,
      totalDurationMs: totalDuration,
    });
  } catch (err: any) {
    console.error("Copilot Error:", err);
    res.status(500).json({
      error: err.message,
      answer: `Error executing query: ${err.message}. Please check your database connection or OpenAI API key.`,
    });
  }
});

// Serve frontend for any other route
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(port, () => {
  console.log(`\n======================================================`);
  console.log(`🌾 Sanjivani Sugar Factory Portal running!`);
  console.log(`🌐 Web UI: http://localhost:${port}`);
  console.log(`📊 API endpoints: /api/farmers, /api/stats, /api/copilot`);
  console.log(`======================================================\n`);
});
