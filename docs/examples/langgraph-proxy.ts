/**
 * Complete TypeScript Example: Running LangGraph Agent with OpenAI-Compatible Endpoint
 * 
 * This demonstrates using langgraph_openai_serve with a LangGraph agent
 * exposed as a `/v1/chat/completions` endpoint.
 */

import OpenAI from "openai";

/**
 * Configuration
 */
const LANGGRAPH_BASE_URL = "http://localhost:8000/v1"; // langgraph_openai_serve running here
const MODEL_NAME = "my-agent"; // matches GraphConfig registry key

/**
 * Create OpenAI client pointing to langgraph_openai_serve
 */
const client = new OpenAI({
    baseURL: LANGGRAPH_BASE_URL,
    apiKey: "any-value", // langgraph_openai_serve doesn't validate API keys
});

/**
 * Non-streaming example
 */
async function nonStreamingExample() {
    console.log("=== Non-Streaming Example ===\n");

    const response = await client.chat.completions.create({
        model: MODEL_NAME,
        messages: [
            {
                role: "system",
                content: "You are a helpful assistant that explains concepts clearly.",
            },
            {
                role: "user",
                content: "What is machine learning in simple terms?",
            },
        ],
        temperature: 0.7,
        max_tokens: 500,
    });

    console.log("Assistant:", response.choices[0].message.content);
    console.log("Tokens used:", response.usage?.total_tokens);
}

/**
 * Streaming example - token by token
 */
async function streamingExample() {
    console.log("\n=== Streaming Example ===\n");
    console.log("Assistant: ");

    const stream = await client.chat.completions.create({
        model: MODEL_NAME,
        messages: [
            {
                role: "system",
                content: "You are a helpful assistant.",
            },
            {
                role: "user",
                content:
                    "Write a short poem about artificial intelligence in 50 words.",
            },
        ],
        stream: true,
        temperature: 0.8,
    });

    let totalTokens = 0;

    for await (const chunk of stream) {
        // Check if this chunk has content
        if (chunk.choices[0]?.delta?.content) {
            process.stdout.write(chunk.choices[0].delta.content);
        }

        // Some chunks contain usage information
        if (chunk.usage) {
            totalTokens = chunk.usage.total_tokens;
        }
    }

    console.log("\n\nTokens used:", totalTokens);
}

/**
 * Multi-turn conversation example
 */
async function conversationExample() {
    console.log("\n=== Multi-Turn Conversation ===\n");

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        {
            role: "system",
            content: "You are a helpful coding assistant.",
        },
    ];

    // Turn 1
    const userMessage1 = "How do I sort an array in JavaScript?";
    console.log(`User: ${userMessage1}`);
    messages.push({ role: "user", content: userMessage1 });

    const response1 = await client.chat.completions.create({
        model: MODEL_NAME,
        messages,
    });

    const assistantMessage1 = response1.choices[0].message.content || "";
    console.log(`Assistant: ${assistantMessage1}\n`);
    messages.push({ role: "assistant", content: assistantMessage1 });

    // Turn 2 - with context from previous turn
    const userMessage2 = "Can you show an example with objects?";
    console.log(`User: ${userMessage2}`);
    messages.push({ role: "user", content: userMessage2 });

    const response2 = await client.chat.completions.create({
        model: MODEL_NAME,
        messages,
    });

    const assistantMessage2 = response2.choices[0].message.content || "";
    console.log(`Assistant: ${assistantMessage2}`);
}

/**
 * Error handling example
 */
async function errorHandlingExample() {
    console.log("\n=== Error Handling ===\n");

    try {
        const response = await client.chat.completions.create({
            model: "non-existent-model", // This will fail
            messages: [{ role: "user", content: "Hello" }],
        });
    } catch (error) {
        if (error instanceof OpenAI.APIError) {
            console.log("API Error:", error.message);
            console.log("Status:", error.status);
            console.log("Error code:", error.code);
        } else {
            console.log("Unexpected error:", error);
        }
    }
}

/**
 * Stream with proper resource cleanup
 */
async function streamWithCleanup() {
    console.log("\n=== Streaming with Cleanup ===\n");

    const stream = await client.chat.completions.create({
        model: MODEL_NAME,
        messages: [{ role: "user", content: "Count to 10 slowly" }],
        stream: true,
    });

    try {
        for await (const chunk of stream) {
            if (chunk.choices[0]?.delta?.content) {
                process.stdout.write(chunk.choices[0].delta.content);
            }
        }
        console.log("\n✓ Stream completed successfully");
    } catch (error) {
        console.error("Stream error:", error);
        // Stream is automatically closed on error
    }
}

/**
 * Using with LangGraph agent that supports tool calling
 */
async function agentWithToolsExample() {
    console.log("\n=== Agent with Tools ===\n");

    // Assuming your LangGraph agent is configured with tools
    const response = await client.chat.completions.create({
        model: MODEL_NAME,
        messages: [
            {
                role: "user",
                content:
                    "What is the current weather in New York? (Your agent should have access to a weather tool)",
            },
        ],
    });

    console.log(response.choices[0].message.content);

    // Note: Tool calling handling depends on your specific LangGraph agent setup
    // The langgraph_openai_serve wrapper handles the tool calling loop internally
}

/**
 * Production-ready helper: Rate limiting with retry
 */
async function callWithRetry(
    messages: OpenAI.Chat.ChatCompletionMessageParam[],
    maxRetries = 3,
    delayMs = 1000
) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await client.chat.completions.create({
                model: MODEL_NAME,
                messages,
                temperature: 0.7,
            });
        } catch (error) {
            if (attempt === maxRetries) throw error;

            const delay = delayMs * Math.pow(2, attempt - 1); // Exponential backoff
            console.log(`Attempt ${attempt} failed, retrying in ${delay}ms...`);
            await new Promise((resolve) => setTimeout(resolve, delay));
        }
    }
}

/**
 * Production-ready helper: Streaming with timeout
 */
async function streamWithTimeout(
    messages: OpenAI.Chat.ChatCompletionMessageParam[],
    timeoutMs = 30000
) {
    const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Stream timeout")), timeoutMs)
    );

    const streamPromise = (async () => {
        const stream = await client.chat.completions.create({
            model: MODEL_NAME,
            messages,
            stream: true,
        });

        let result = "";
        for await (const chunk of stream) {
            if (chunk.choices[0]?.delta?.content) {
                result += chunk.choices[0].delta.content;
            }
        }
        return result;
    })();

    return Promise.race([streamPromise, timeoutPromise]);
}

/**
 * Main execution
 */
async function main() {
    console.log("LangGraph OpenAI-Compatible Client Examples\n");
    console.log("Prerequisites:");
    console.log("1. Start langgraph_openai_serve: uvicorn server:graph_serve.app");
    console.log("2. Configure with your LangGraph agent\n");

    try {
        // Run examples
        // await nonStreamingExample();
        // await streamingExample();
        // await conversationExample();
        // await streamWithCleanup();

        // Try one example (comment out others)
        await nonStreamingExample();

        // Test retry logic
        // const response = await callWithRetry([
        //   { role: "user", content: "Hello!" }
        // ]);
        // console.log(response.choices[0].message.content);

        // Test timeout
        // const result = await streamWithTimeout(
        //   [{ role: "user", content: "Write a story" }],
        //   15000
        // );
        // console.log("Result:", result);
    } catch (error) {
        console.error("Error:", error);
        process.exit(1);
    }
}

main();

/**
 * TypeScript Type Definitions for Reference
 *
 * OpenAI SDK types you'll use most:
 * - OpenAI.Chat.ChatCompletionMessageParam
 * - OpenAI.Chat.ChatCompletion
 * - OpenAI.Chat.ChatCompletionChunk
 * - OpenAI.APIError
 *
 * Message roles: "user" | "assistant" | "system" | "tool" | "function"
 */

/**
 * SETUP CHECKLIST:
 *
 * [ ] Install dependencies:
 *     npm install openai
 *
 * [ ] Start langgraph_openai_serve (in separate terminal):
 *     pip install langgraph-openai-serve
 *     python server.py  # or uvicorn server:graph_serve.app
 *
 * [ ] Verify server running:
 *     curl http://localhost:8000/v1/models
 *
 * [ ] Update LANGGRAPH_BASE_URL if using different port
 *
 * [ ] Update MODEL_NAME to match your GraphConfig registry key
 *
 * [ ] Run examples:
 *     npx ts-node examples.ts
 *     # or
 *     npm run dev
 *
 * DEBUGGING TIPS:
 *
 * - Enable verbose logging:
 *   const client = new OpenAI({...});
 *   client.on("debug", (info) => console.log("DEBUG:", info));
 *
 * - Check server logs for errors
 * - Use curl to test endpoint:
 *   curl -X POST http://localhost:8000/v1/chat/completions \
 *     -H "Content-Type: application/json" \
 *     -d '{"model":"my-agent","messages":[{"role":"user","content":"Hi"}]}'
 *
 * - Verify LangGraph agent works:
 *   langgraph test my-agent
 *
 * PERFORMANCE:
 *
 * - Reuse client instance (done here)
 * - Enable streaming for long responses
 * - Implement connection pooling for high volume
 * - Monitor token usage for cost tracking
 * - Cache responses when possible
 */
