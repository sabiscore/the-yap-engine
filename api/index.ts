import type { IncomingMessage, ServerResponse } from "node:http";
import server from "./apps/swarmx-api/src/server.js";

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  await server.ready();
  server.server.emit("request", req, res);
}
