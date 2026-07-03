import OpenAI from "openai";
import { config } from "../config.js";
import { readFile, unlink } from "node:fs/promises";
import { logger } from "../utils/logger.js";

let openai: OpenAI | null = null;

function getClient(): OpenAI {
  if (!openai) {
    openai = new OpenAI({ apiKey: config.OPENAI_API_KEY });
  }
  return openai;
}

export async function transcribe(filePath: string): Promise<string> {
  const fileBuffer = await readFile(filePath);

  if (config.STT_PROVIDER === "openai") {
    const response = await getClient().audio.transcriptions.create({
      model: "whisper-1",
      file: new File([fileBuffer], "audio.ogg", { type: "audio/ogg" }),
    });
    await unlink(filePath).catch(() => {});
    return response.text;
  }

  try {
    const localClient = new OpenAI({
      baseURL: config.STT_LOCAL_BASE_URL,
      apiKey: "sk-local",
    });
    const response = await localClient.audio.transcriptions.create({
      model: "whisper-1",
      file: new File([fileBuffer], "audio.ogg", { type: "audio/ogg" }),
    });
    await unlink(filePath).catch(() => {});
    return response.text;
  } catch (err) {
    logger.warn(`Local STT failed: ${err}`);
    await unlink(filePath).catch(() => {});
    return "";
  }
}
