import { HttpError } from "./errors.js";

export function requireUser(db) {
  return async (req, _res, next) => {
    const token = req.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
    const userId = token ? await db.userIdFromToken(token) : null;
    if (!userId) throw new HttpError(401, "unauthorized", "Please sign in again.");
    req.userId = userId;
    next();
  };
}
