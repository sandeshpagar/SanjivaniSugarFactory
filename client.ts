import "dotenv/config";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function main() {
  // 1. Hardcoded user question
  const question = "Which farmers have pending payment greater than 100000 rupees in Sanjivani factory, and what is their total pending amount?";
  console.log(`\n[User Question]: ${question}\n`);

  // 2. Connect to the MCP Server over Stdio
  const transport = new StdioClientTransport({
    command: process.platform === "win32" ? "npx.cmd" : "npx",
    args: ["tsx", "server.ts"],
  });

  const client = new Client(
    { name: "sanjivani-mcp-client", version: "1.0.0" },
    { capabilities: {} }
  );

  await client.connect(transport);
  console.log("[MCP Client] Connected to MCP Server.");

  // 3. Discover available tools from MCP Server
  const { tools } = await client.listTools();
  console.log(`[MCP Client] Available MCP tools: ${tools.map((t) => t.name).join(", ")}`);

  // 4. Map MCP tools to OpenAI format
  const openaiTools = tools.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    },
  }));

  // 5. Ask OpenAI with tool definitions
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: question }],
    tools: openaiTools,
  });

  const message = response.choices[0].message;

  // 6. Execute MCP tool if requested by OpenAI
  if (message.tool_calls && message.tool_calls.length > 0) {
    const toolCall = message.tool_calls[0];
    console.log(`[MCP Client] LLM called tool: ${toolCall.function.name}`);

    // Call tool through MCP Client -> MCP Server
    const toolResult = await client.callTool({
      name: toolCall.function.name,
      arguments: JSON.parse(toolCall.function.arguments),
    });

    const resultText = toolResult.content
      .map((c) => (c.type === "text" ? c.text : ""))
      .join("\n");

    console.log(`[MCP Client] Tool output:\n${resultText}\n`);

    // Pass tool output back to OpenAI to formulate final response
    const finalResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "user", content: question },
        message,
        {
          role: "tool",
          tool_call_id: toolCall.id,
          content: resultText,
        },
      ],
    });

    console.log("\n=================== Sanjivani AI Answer ===================");
    console.log(finalResponse.choices[0].message.content);
    console.log("===========================================================\n");
  } else {
    console.log("\n[Response]:", message.content);
  }

  // 7. Graceful shutdown
  await client.close();
}

main().catch(console.error);
