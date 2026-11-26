import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware.js";
import { postBuyTransaction, postSellTransaction } from "./transactions.controller.js";

const transactionsRouter = Router();

transactionsRouter.use(requireAuth);

transactionsRouter.post("/buy", postBuyTransaction);
transactionsRouter.post("/sell", postSellTransaction);

export { transactionsRouter };