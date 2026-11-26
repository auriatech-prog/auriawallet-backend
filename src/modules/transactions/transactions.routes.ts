import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware.js";
import {
  getTransactions,
  postBuyTransaction,
  postConvertTransaction,
  postSellTransaction,
} from "./transactions.controller.js";

const transactionsRouter = Router();

transactionsRouter.use(requireAuth);

transactionsRouter.post("/buy", postBuyTransaction);
transactionsRouter.post("/sell", postSellTransaction);
transactionsRouter.post("/convert", postConvertTransaction);
transactionsRouter.get("/", getTransactions);

export { transactionsRouter };