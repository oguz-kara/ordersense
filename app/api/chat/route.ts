import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { RAGSource } from "@/app/lib/utils";
import { retrieveContext } from "@/app/lib/kb";
import { findOrder, guardrailBlock, orderContext } from "@/app/lib/shop";
import { escalate, isMock } from "@/app/lib/escalate";
import crypto from "crypto";
import customerSupportCategories from "@/app/lib/customer_support_categories.json";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Debug message helper function
// Input: message string and optional data object
// Output: JSON string with message, sanitized data, and timestamp
const debugMessage = (msg: string, data: any = {}) => {
  console.log(msg, data);
  const timestamp = new Date().toISOString().replace(/[^\x20-\x7E]/g, "");
  const safeData = JSON.parse(JSON.stringify(data));
  return JSON.stringify({ msg, data: safeData, timestamp });
};

// Define the schema for the AI response using Zod
// This ensures type safety and validation for the AI's output
const responseSchema = z.object({
  response: z.string(),
  thinking: z.string(),
  user_mood: z.enum([
    "positive",
    "neutral",
    "negative",
    "curious",
    "frustrated",
    "confused",
  ]),
  suggested_questions: z.array(z.string()),
  debug: z.object({
    context_used: z.boolean(),
  }),
  matched_categories: z.array(z.string()).optional(),
  redirect_to_agent: z
    .object({
      should_redirect: z.boolean(),
      reason: z.string().optional(),
    })
    .optional(),
});

// Helper function to sanitize header values
// Input: string value
// Output: sanitized string (ASCII characters only)
function sanitizeHeaderValue(value: string): string {
  return value.replace(/[^\x00-\x7F]/g, "");
}

// Helper function to log timestamps for performance measurement
// Input: label string and start time
// Output: Logs the duration for the labeled operation
const logTimestamp = (label: string, start: number) => {
  const timestamp = new Date().toISOString();
  const time = ((performance.now() - start) / 1000).toFixed(2);
  console.log(`⏱️ [${timestamp}] ${label}: ${time}s`);
};

// Main POST request handler
export async function POST(req: Request) {
  const apiStart = performance.now();
  const measureTime = (label: string) => logTimestamp(label, apiStart);

  // Extract data from the request body
  const { messages, model, knowledgeBaseId } = await req.json();
  const latestMessage = messages[messages.length - 1].content;

  console.log("📝 Latest Query:", latestMessage);
  measureTime("User Input Received");

  // Prepare debug data
  const MAX_DEBUG_LENGTH = 1000;
  const debugData = sanitizeHeaderValue(
    debugMessage("🚀 API route called", {
      messagesReceived: messages.length,
      latestMessageLength: latestMessage.length,
      anthropicKeySlice: process.env.ANTHROPIC_API_KEY?.slice(0, 4) + "****",
    }),
  ).slice(0, MAX_DEBUG_LENGTH);

  // ---- OrderSense: order lookup + hard guardrails (BEFORE any AI call) ----
  const order = await findOrder(latestMessage);
  if (order) {
    const blocked = guardrailBlock(order);
    if (blocked) {
      const gorgias = await escalate({
        reason: blocked,
        summary: `Customer asked about ${order.orderNumber}; agent did not answer (guardrail).`,
        source: "guardrail",
        orderNumber: order.orderNumber,
      });
      return new Response(
        JSON.stringify({
          id: crypto.randomUUID(),
          thinking: `Guardrail: ${blocked} — the model was never called for this order.`,
          response:
            "I'm connecting you with a member of our support team who can help with this order directly — one moment please.",
          user_mood: "neutral",
          suggested_questions: [],
          debug: { context_used: false },
          matched_categories: ["order_status"],
          redirect_to_agent: { should_redirect: true, reason: `${blocked} · ${gorgias}` },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
  }
  const orderCtx = order ? orderContext(order) : "";

  // Initialize variables for RAG retrieval
  let retrievedContext = "";
  let isRagWorking = false;
  let ragSources: RAGSource[] = [];

  // Attempt to retrieve context from RAG
  try {
    console.log("🔍 Initiating RAG retrieval for query:", latestMessage);
    measureTime("RAG Start");
    const result = await retrieveContext(latestMessage, knowledgeBaseId);
    retrievedContext = result.context;
    isRagWorking = result.isRagWorking;
    ragSources = result.ragSources || [];

    if (!result.isRagWorking) {
      console.warn("🚨 RAG Retrieval failed but did not throw!");
    }

    measureTime("RAG Complete");
    console.log("🔍 RAG Retrieved:", isRagWorking ? "YES" : "NO");
    console.log(
      "✅ RAG retrieval completed successfully. Context:",
      retrievedContext.slice(0, 100) + "...",
    );
  } catch (error) {
    console.error("💀 RAG Error:", error);
    console.error("❌ RAG retrieval failed for query:", latestMessage);
    retrievedContext = "";
    isRagWorking = false;
    ragSources = [];
  }

  measureTime("RAG Total Duration");

  // Prepare categories context for the system prompt
  const USE_CATEGORIES = true;
  const categoryListString = customerSupportCategories.categories
    .map((c) => c.id)
    .join(", ");

  const categoriesContext = USE_CATEGORIES
    ? `
    To help with our internal classification of inquiries, we would like you to categorize inquiries in addition to answering them. We have provided you with ${customerSupportCategories.categories.length} customer support categories.
    Check if your response fits into any category and include the category IDs in your "matched_categories" array.
    The available categories are: ${categoryListString}
    If multiple categories match, include multiple category IDs. If no categories match, return an empty array.
  `
    : "";

  const systemPrompt = `You are the customer support assistant for Loura Apparel, an EU-based clothing brand (chat widget, WhatsApp and Instagram DM). Answer in the customer's language (English, German or French). Be concise, warm and professional.

  HARD RULES (non-negotiable):
  - Never promise or initiate a refund. You may only state the return policy and eligibility; refunds are confirmed by the team after the return arrives.
  - Only state order facts that appear in ORDER CONTEXT below. If there is no ORDER CONTEXT, ask for the order number (format LA-12345) or the email used at checkout.
  - If the customer says a delivered order did not arrive, or is clearly angry, set redirect_to_agent with a short reason — a human takes over in the same thread.
  - Do not answer questions unrelated to Loura Apparel orders, products or policies; redirect instead.

  ${orderCtx ? orderCtx : "ORDER CONTEXT: none — no order identified in this conversation yet."}

  KNOWLEDGE BASE (retrieved for this query; use only this for policy answers):
  ${isRagWorking ? `${retrievedContext}` : "No policy information found for this query."}

  ${categoriesContext}

  You are the first point of contact for the user and should try to resolve their issue or provide relevant information. If you are unable to help the user or if the user explicitly asks to talk to a human, you can redirect them to a human agent for further assistance.
  
  To display your responses correctly, you must format your entire response as a valid JSON object with the following structure:
  {
      "thinking": "Brief explanation of your reasoning for how you should address the user's query",
      "response": "Your concise response to the user",
      "user_mood": "positive|neutral|negative|curious|frustrated|confused",
      "suggested_questions": ["Question 1?", "Question 2?", "Question 3?"],
      "debug": {
        "context_used": true|false
      },
      ${USE_CATEGORIES ? '"matched_categories": ["category_id1", "category_id2"],' : ""}
      "redirect_to_agent": {
        "should_redirect": boolean,
        "reason": "Reason for redirection (optional, include only if should_redirect is true)"
      }
    }

  Here are a few examples of how your response should look like:

  Example of a response without redirection to a human agent:
  {
    "thinking": "Providing relevant information from the knowledge base",
    "response": "Here's the information you requested...",
    "user_mood": "curious",
    "suggested_questions": ["How do I update my account?", "What are the payment options?"],
    "debug": {
      "context_used": true
    },
    "matched_categories": ["account_management", "billing"],
    "redirect_to_agent": {
      "should_redirect": false
    }
  }

  Example of a response with redirection to a human agent:
  {
    "thinking": "User request requires human intervention",
    "response": "I understand this is a complex issue. Let me connect you with a human agent who can assist you better.",
    "user_mood": "frustrated",
    "suggested_questions": [],
    "debug": {
      "context_used": false
    },
    "matched_categories": ["technical_support"],
    "redirect_to_agent": {
      "should_redirect": true,
      "reason": "Complex technical issue requiring human expertise"
    }
  }
  `

  function sanitizeAndParseJSON(jsonString : string) {
    // Replace newlines within string values
    const sanitized = jsonString.replace(/(?<=:\s*")(.|\n)*?(?=")/g, match => 
      match.replace(/\n/g, "\\n")
    );
  
    try {
      return JSON.parse(sanitized);
    } catch (parseError) {
      console.error("Error parsing JSON response:", parseError);
      throw new Error("Invalid JSON response from AI");
    }
  }

  try {
    console.log(`🚀 Query Processing`);
    measureTime("Claude Generation Start");

    if (isMock()) {
      // Deterministic response so the UI is fully workable without credits.
      const mockResponse = {
        id: crypto.randomUUID(),
        thinking: "[MOCK] No model call (ORDERSENSE_MOCK=1). Composed from retrieval + order context.",
        response: order
          ? `[MOCK] ${orderCtx.split("\n")[3] ?? ""} — happy to help with anything else about order ${order.orderNumber}.`
          : isRagWorking
            ? `[MOCK] Based on our policy: ${retrievedContext.slice(0, 180)}…`
            : "[MOCK] Could you share your order number (LA-12345) or checkout email?",
        user_mood: "neutral" as const,
        suggested_questions: ["Where is my order?", "How do returns work?", "What sizes do you carry?"],
        debug: { context_used: isRagWorking },
        matched_categories: order ? ["order_status"] : [],
        redirect_to_agent: { should_redirect: false },
      };
      const mockApi = new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
      if (ragSources.length > 0) {
        mockApi.headers.set("x-rag-sources", sanitizeHeaderValue(JSON.stringify(ragSources)));
      }
      mockApi.headers.set("X-Debug-Data", sanitizeHeaderValue(debugData));
      return mockApi;
    }

    const anthropicMessages = messages.map((msg: any) => ({
      role: msg.role,
      content: msg.content,
    }));

    // NOTE: the base repo prefilled an assistant "{" turn; current Claude
    // models reject assistant prefill, so we instruct JSON-only instead.
    const response = await anthropic.messages.create({
      model: process.env.ORDERSENSE_MODEL ?? "claude-sonnet-5",
      max_tokens: 1000,
      messages: anthropicMessages,
      system:
        systemPrompt +
        "\n\nRespond ONLY with the JSON object — no prose before or after it.",
      temperature: 0.3,
    });

    measureTime("Claude Generation Complete");
    console.log("✅ Message generation completed");

    // Extract text content from the response
    const textContent = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join(" ")
      .trim();

    // Parse the JSON response
    let parsedResponse;
    try {
      parsedResponse = sanitizeAndParseJSON(textContent);
    } catch (parseError) {
      console.error("Error parsing JSON response:", parseError);
      throw new Error("Invalid JSON response from AI");
    }

    const validatedResponse = responseSchema.parse(parsedResponse);

    const responseWithId = {
      id: crypto.randomUUID(),
      ...validatedResponse,
    };

    // Check if redirection to a human agent is needed
    if (responseWithId.redirect_to_agent?.should_redirect) {
      console.log("🚨 AGENT REDIRECT TRIGGERED!");
      console.log("Reason:", responseWithId.redirect_to_agent.reason);
      await escalate({
        reason: responseWithId.redirect_to_agent.reason ?? "model requested handoff",
        summary: `Last message: ${String(latestMessage).slice(0, 200)}`,
        source: "model",
        orderNumber: order?.orderNumber,
      });
    }

    // Prepare the response object
    const apiResponse = new Response(JSON.stringify(responseWithId), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });

    // Add RAG sources to the response headers if available
    if (ragSources.length > 0) {
      apiResponse.headers.set(
        "x-rag-sources",
        sanitizeHeaderValue(JSON.stringify(ragSources)),
      );
    }

    // Add debug data to the response headers
    apiResponse.headers.set("X-Debug-Data", sanitizeHeaderValue(debugData));

    measureTime("API Complete");

    return apiResponse;
  } catch (error) {
    // Handle errors in AI response generation
    console.error("💥 Error in message generation:", error);
    const errorResponse = {
      response:
        "Sorry, there was an issue processing your request. Please try again later.",
      thinking: "Error occurred during message generation.",
      user_mood: "neutral",
      debug: { context_used: false },
    };
    return new Response(JSON.stringify(errorResponse), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
