import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import pg from "pg";

// 1. PostgreSQL Connection
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

// 2. Initialize MCP Server
const server = new McpServer({
  name: "sanjivani-sugarcane-server",
  version: "1.0.0",
});

// 3. Register Tool: get_farmers_data
server.tool(
  "get_farmers_data",
  "Fetch sugarcane farmers data from Sanjivani factory database. Can filter by village or return all records.",
  {
    village: z.string().optional().describe("Optional village name to filter farmers (e.g. Kopargaon, Shirdi)"),
  },
  async ({ village }) => {
    try {
      const query = village
        ? "SELECT * FROM farmers WHERE LOWER(village) = LOWER($1)"
        : "SELECT * FROM farmers ORDER BY id ASC";
      const values = village ? [village] : [];
      const result = await pool.query(query, values);

      if (result.rows.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "Table 'farmers' has 0 records. Please insert farmer rows into the database.",
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result.rows, null, 2),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Database Error: ${error.message}`,
          },
        ],
      };
    }
  }
);

// 4. Connect via Standard I/O (Stdio) Transport
const transport = new StdioServerTransport();
await server.connect(transport);