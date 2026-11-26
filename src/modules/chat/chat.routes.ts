import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware.js";
import { postChatMessage } from "./chat.controller.js";

const chatRouter = Router();

chatRouter.use(requireAuth);
chatRouter.post("/", postChatMessage);

export { chatRouter };