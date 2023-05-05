import { TextMessage, WebhookEvent } from "@line/bot-sdk";
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

app.post("/api/insert-test", async (c) => {
  const data = await c.req.json();
  const item = data.item;
  console.log(item);
  const stmt = await c.env.DB.prepare(
    `INSERT INTO shopping_list (item) VALUES (?);`
  ).bind(item);
  const result = await stmt.run();
  return c.json(result);
});

app.post("/api/webhook", async (c) => {
  const data = await c.req.json();
  const events: WebhookEvent[] = (data as any).events;
  const accessToken: string = c.env.CHANNEL_ACCESS_TOKEN;
  const event = events
    .map((event: WebhookEvent) => {
      if (event.type != "message" || event.message.type != "text") {
        return;
      }
      return event;
    })
    .filter((event) => event)[0];
  // undefinedを除外
  if (!event) {
    return c.json({ message: "No event: ${events}" });
  }
  const { replyToken } = event;
  const { text } = event.message as TextMessage;

  // textの内容が「一覧」の場合、DBからデータを取得して、番号を日付順につけて返す
  if (text === "一覧") {
    const stmt = await c.env.DB.prepare(`SELECT * FROM shopping_list;`);
    const allResults: D1Result<ShoppingItem> = await stmt.all();
    if (!allResults.results) {
      // undefiled result
      return c.json({ message: "no results" });
    }

    const results: { results: ShoppingItem[] } = {
      results: allResults.results || [],
    };
    // convert results to string
    const message: string = results.results
      .map((result) => {
        return `${result.id}: ${result.item}`;
      })
      .join("\n");
    // LINEに返信する
    const client = new LineClient(accessToken);
    client.replyMessage(replyToken, message);
    return c.json({ message: "ok" });
  }

  return c.json({ message: "ok" });
});

export default app;
