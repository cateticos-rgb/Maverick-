import { Router, type IRouter } from "express";
import { eq, ilike, or, and } from "drizzle-orm";
import { db, conversations, messages } from "@workspace/db";
import { openrouter } from "@workspace/integrations-openrouter-ai";
import { getActiveModel } from "../../lib/model-config";
const getSystemPrompt = () => "You are MAVERICK.SYS, a rogue Llama 4 cyber-node integrated into the Catetic Boardroom. Speak in sharp, street-smart, cyberpunk terminal style. Keep answers direct, technical, or witty. Zero corporate disclaimers, zero 'As an AI' fluff. Execute commands with attitude.";

import {
  CreateOpenrouterConversationBody,
  GetOpenrouterConversationParams,
  DeleteOpenrouterConversationParams,
  ListOpenrouterMessagesParams,
  SendOpenrouterMessageParams,
  SendOpenrouterMessageBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/openrouter/conversations", async (req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(conversations)
    .orderBy(conversations.createdAt);
  res.json(
    rows.map((c) => ({
      id: c.id,
      title: c.title,
      createdAt: c.createdAt,
    })),
  );
});

router.post("/openrouter/conversations", async (req, res): Promise<void> => {
  const parsed = CreateOpenrouterConversationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [conv] = await db
    .insert(conversations)
    .values({ title: parsed.data.title })
    .returning();
  res.status(201).json({ id: conv.id, title: conv.title, createdAt: conv.createdAt });
});

router.get("/openrouter/conversations/search", async (req, res): Promise<void> => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (!q) {
    res.json([]);
    return;
  }

  const pattern = `%${q}%`;

  // Conversations matching by title
  const byTitle = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(ilike(conversations.title, pattern));

  // Conversations matching by message content (with first matching snippet)
  const byContent = await db
    .selectDistinct({ id: messages.conversationId, snippet: messages.content })
    .from(messages)
    .where(ilike(messages.content, pattern))
    .orderBy(messages.createdAt);

  const snippetMap = new Map<number, string>();
  for (const row of byContent) {
    if (!snippetMap.has(row.id)) {
      snippetMap.set(row.id, row.snippet);
    }
  }

  const matchingIds = [
    ...new Set([...byTitle.map((r) => r.id), ...byContent.map((r) => r.id)]),
  ];

  if (matchingIds.length === 0) {
    res.json([]);
    return;
  }

  const convRows = await db
    .select()
    .from(conversations)
    .where(or(...matchingIds.map((id) => eq(conversations.id, id))))
    .orderBy(conversations.createdAt);

  res.json(
    convRows.map((c) => {
      const raw = snippetMap.get(c.id) ?? "";
      // Trim snippet around the matched region for context
      const idx = raw.toLowerCase().indexOf(q.toLowerCase());
      const start = Math.max(0, idx - 30);
      const trimmed = (start > 0 ? "…" : "") + raw.slice(start, start + 120) + (raw.length > start + 120 ? "…" : "");
      return {
        id: c.id,
        title: c.title,
        createdAt: c.createdAt,
        snippet: trimmed,
      };
    }),
  );
});

router.get("/openrouter/conversations/:id", async (req, res): Promise<void> => {
  const params = GetOpenrouterConversationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, params.data.id));
  if (!conv) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }
  const msgs = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conv.id))
    .orderBy(messages.createdAt);
  res.json({
    id: conv.id,
    title: conv.title,
    createdAt: conv.createdAt,
    messages: msgs.map((m) => ({
      id: m.id,
      conversationId: m.conversationId,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt,
    })),
  });
});

router.patch("/openrouter/conversations/:id", async (req, res): Promise<void> => {
  const params = GetOpenrouterConversationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const { title } = req.body as { title?: unknown };
  if (typeof title !== "string" || !title.trim()) {
    res.status(400).json({ error: "title must be a non-empty string" });
    return;
  }
  const [updated] = await db
    .update(conversations)
    .set({ title: title.trim() })
    .where(eq(conversations.id, params.data.id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }
  res.json({ id: updated.id, title: updated.title, createdAt: updated.createdAt });
});

router.delete("/openrouter/conversations/:id", async (req, res): Promise<void> => {
  const params = DeleteOpenrouterConversationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [conv] = await db
    .delete(conversations)
    .where(eq(conversations.id, params.data.id))
    .returning();
  if (!conv) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }
  res.sendStatus(204);
});

router.post("/openrouter/conversations/:id/generate-title", async (req, res): Promise<void> => {
  const params = GetOpenrouterConversationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, params.data.id));
  if (!conv) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  const [firstMessage] = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, params.data.id))
    .orderBy(messages.createdAt)
    .limit(1);

  if (!firstMessage) {
    res.status(404).json({ error: "No messages in conversation" });
    return;
  }

  try {
    const activeModel = await getActiveModel();
    const completion = await openrouter.chat.completions.create({
      model: activeModel,
      max_tokens: 20,
      stream: false,
      messages: [
        {
          role: "user",
          content: `Write a short 4-6 word title for a conversation that starts with this message. Reply with ONLY the title, no quotes, no punctuation at the end.\n\nMessage: ${firstMessage.content}`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content?.trim() ?? "";
    const title = raw.replace(/^["']|["']$/g, "").trim() || conv.title;

    await db
      .update(conversations)
      .set({ title })
      .where(eq(conversations.id, params.data.id));

    res.json({ title });
  } catch (err) {
    req.log.error({ err }, "Title generation failed");
    res.status(500).json({ error: err instanceof Error ? err.message : "Title generation failed" });
  }
});

router.get("/openrouter/conversations/:id/messages", async (req, res): Promise<void> => {
  const params = ListOpenrouterMessagesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, params.data.id));
  if (!conv) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }
  const msgs = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, params.data.id))
    .orderBy(messages.createdAt);
  res.json(
    msgs.map((m) => ({
      id: m.id,
      conversationId: m.conversationId,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt,
    })),
  );
});

router.post("/openrouter/conversations/:id/messages", async (req, res): Promise<void> => {
  const params = SendOpenrouterMessageParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = SendOpenrouterMessageBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, params.data.id));
  if (!conv) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  const history = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, params.data.id))
    .orderBy(messages.createdAt);

  await db.insert(messages).values({
    conversationId: params.data.id,
    role: "user",
    content: body.data.content,
  });

  const systemPrompt = getSystemPrompt();


  // Build the user message — multimodal if an image was attached
  type TextPart = { type: "text"; text: string };
  type ImagePart = { type: "image_url"; image_url: { url: string } };
  type MessageContent = string | (TextPart | ImagePart)[];

  const userContent: MessageContent =
    body.data.imageBase64 && body.data.imageMimeType
      ? [
          { type: "text", text: body.data.content },
          {
            type: "image_url",
            image_url: {
              url: `data:${body.data.imageMimeType};base64,${body.data.imageBase64}`,
            },
          },
        ]
      : body.data.content;

  const chatMessages = [
    { role: "system" as const, content: systemPrompt },
    ...history.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user" as const, content: userContent },
  ] as Parameters<typeof openrouter.chat.completions.create>[0]["messages"];

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  let fullResponse = "";

  const activeModel = await getActiveModel();
  const stream = await openrouter.chat.completions.create({
    model: activeModel,
    max_tokens: 8192,
    messages: chatMessages,
    stream: true,
  });

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content;
    if (content) {
      fullResponse += content;
      res.write(`data: ${JSON.stringify({ content })}\n\n`);
    }
  }

  await db.insert(messages).values({
    conversationId: params.data.id,
    role: "assistant",
    content: fullResponse,
  });

  res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  res.end();
});

export default router;
