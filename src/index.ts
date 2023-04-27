import {
  MessageAPIResponseBase,
  TextMessage,
  WebhookEvent,
} from "@line/bot-sdk";
import { Hono } from "hono";
import { Env as BaseEnv } from "hono/dist/types/types";

type Env = BaseEnv & {
  CHANNEL_ACCESS_TOKEN: string;
  DB: D1Database;
};

const app = new Hono<{ Bindings: Env }>();

type ShoppingItem = {
  id: number;
  item: string;
  added_at: string;
};

app.get("/api/select-test", async (c) => {
  const stmt = await c.env.DB.prepare(`SELECT * FROM shopping_list;`);
  const allResults: D1Result<ShoppingItem> = await stmt.all();

  if (!allResults.results) {
    // undefiled result
    return c.json({ message: "no results" });
  }

  const results: { results: ShoppingItem[] } = {
    results: allResults.results || [],
  };
  return c.json(results);
});

app.post("/api/webhook", async (c) => {
  const data = await c.req.json();
  const events: WebhookEvent[] = (data as any).events;
  const accessToken: string = c.env.CHANNEL_ACCESS_TOKEN;

  await Promise.all(
    events.map(async (event: WebhookEvent) => {
      try {
        await textEventHandler(event, accessToken);
      } catch (err: unknown) {
        if (err instanceof Error) {
          console.error(err);
        }
        return c.json({
          status: "error",
        });
      }
    })
  );
  return c.json({ message: "ok" });
});

const textEventHandler = async (
  event: WebhookEvent,
  accessToken: string
): Promise<MessageAPIResponseBase | undefined> => {
  if (event.type !== "message" || event.message.type !== "text") {
    return;
  }

  const { replyToken } = event;
  const { text } = event.message;
  const response: TextMessage = {
    type: "text",
    text,
  };
  await fetch("https://api.line.me/v2/bot/message/reply", {
    body: JSON.stringify({
      replyToken: replyToken,
      messages: [response],
    }),
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });
};

export default app;
