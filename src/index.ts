import { TextMessage, WebhookEvent } from "@line/bot-sdk";
import { Hono } from "hono";
import { Env as BaseEnv } from "hono/dist/types/types";
import { Line } from "./line";

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
  const client = new Line(c.env.CHANNEL_ACCESS_TOKEN);

  if (text === "一覧") {
    const message: string = await fetchAllItems(c);
    // messageの内容がからの場合、「内容がないよう」と返信する
    if (!message) {
      await client.replyMessage("内容がないよう", replyToken);
    } else {
      await client.replyMessage(message, replyToken);
    }
    return c.json({ message: "LINE 一覧" });
  } else if (text.startsWith("追加")) {
    const items = text.replace("追加", "").split("\n");
    for (const item of items) {
      if (!item) {
        continue;
      }
      const stmt = await c.env.DB.prepare(
        `INSERT INTO shopping_list (item) VALUES (?);`
      ).bind(item);
      await stmt.run();
    }
    await client.replyMessage("追加しました", replyToken);
    return c.json({ message: "LINE 追加" });
  } else if (text.startsWith("削除")) {
    const item = text.replace("削除", "");
    const stmt = await c.env.DB.prepare(
      `DELETE FROM shopping_list WHERE item = ?;`
    ).bind(item);
    await stmt.run();
    await client.replyMessage("削除しました", replyToken);
    return c.json({ message: "LINE 削除" });
  } else if (text === "全てを削除してください" || text === "全てを削除") {
    const stmt = await c.env.DB.prepare(`DELETE FROM shopping_list;`);
    await stmt.run();
    await client.replyMessage("全て削除しました", replyToken);
    return c.json({ message: "LINE 全てを削除してください" });
  }
  return c.json({ message: "ok" });
});

const convertResultToMessage = (allResults: D1Result<ShoppingItem>): string => {
  if (!allResults.results) {
    // undefiled result
    console.log("message: ", "no results");
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
  return message;
};

const fetchAllItems = async (c: any) => {
  const stmt = await c.env.DB.prepare(`SELECT * FROM shopping_list;`);
  const allResults: D1Result<ShoppingItem> = await stmt.all();
  // allResultsのIDを1からの連番へ変換する
  if (allResults.results) {
    allResults.results = allResults.results.map((result, index) => {
      result.id = index + 1;
      return result;
    });
  }
  const message = convertResultToMessage(allResults);
  return message;
};

export default app;
