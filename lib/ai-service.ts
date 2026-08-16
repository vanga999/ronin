export type AiChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type AiProviderSettings = {
  providerName: string;
  baseUrl: string;
  model: string;
  apiKey: string;
};

export function chatCompletionsUrl(baseUrl: string) {
  const normalized = baseUrl.replace(/\/+$/, "");
  return normalized.endsWith("/chat/completions")
    ? normalized
    : `${normalized}/chat/completions`;
}

export function extractChatContent(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices)) return null;
  const message = (choices[0] as { message?: { content?: unknown } } | undefined)?.message;
  const content = message?.content;
  if (typeof content === "string") return content.trim() || null;
  if (Array.isArray(content)) {
    const text = content
      .map((part) => typeof part === "object" && part !== null && "text" in part
        ? String((part as { text: unknown }).text)
        : "")
      .join("")
      .trim();
    return text || null;
  }
  return null;
}

export async function requestChatCompletion(
  settings: AiProviderSettings,
  messages: AiChatMessage[],
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  try {
    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    if (settings.apiKey) headers.authorization = `Bearer ${settings.apiKey}`;
    const response = await fetch(chatCompletionsUrl(settings.baseUrl), {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: settings.model,
        messages,
        temperature: 0.2,
        stream: false,
      }),
      signal: controller.signal,
    });
    const raw = await response.text();
    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = null;
    }
    if (!response.ok) {
      const providerError = payload && typeof payload === "object" && "error" in payload
        ? String((payload as { error: unknown }).error)
        : raw.slice(0, 300);
      throw new Error(`模型接口返回 ${response.status}: ${providerError || "请求失败"}`);
    }
    const content = extractChatContent(payload);
    if (!content) throw new Error("模型接口没有返回可读取的文本");
    return content;
  } finally {
    clearTimeout(timeout);
  }
}
