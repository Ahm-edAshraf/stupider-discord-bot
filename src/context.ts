import type { Player } from "discord-player";
import type { AiController } from "./ai/controller";

export type BotContext = {
  player: Player;
  ai?: AiController;
};
