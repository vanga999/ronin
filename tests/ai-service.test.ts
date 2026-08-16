import { describe, expect, it } from "vitest";
import { chatCompletionsUrl, extractChatContent } from "@/lib/ai-service";

describe("AI Assist OpenAI-compatible adapter", () => {
  it("normalizes a base URL to the chat completions endpoint", () => {
    expect(chatCompletionsUrl("https://api.example.com/v1/")).toBe("https://api.example.com/v1/chat/completions");
    expect(chatCompletionsUrl("http://localhost:11434/v1/chat/completions")).toBe("http://localhost:11434/v1/chat/completions");
  });

  it("reads standard and content-part responses", () => {
    expect(extractChatContent({ choices: [{ message: { content: "  hello  " } }] })).toBe("hello");
    expect(extractChatContent({ choices: [{ message: { content: [{ text: "hello" }, { text: " world" }] } }] })).toBe("hello world");
    expect(extractChatContent({ choices: [] })).toBeNull();
  });
});
