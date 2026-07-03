import OpenAI from "openai";
import { writeFile } from "node:fs/promises";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";
import { generateId } from "../utils/helpers.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let openai: OpenAI | null = null;

function getClient(): OpenAI {
  if (!openai) {
    openai = new OpenAI({ apiKey: config.OPENAI_API_KEY });
  }
  return openai;
}

export async function synthesize(text: string): Promise<string> {
  const filePath = path.resolve(__dirname, `../../data/tts-${generateId()}.mp3`);

  if (config.TTS_PROVIDER === "openai") {
    const response = await getClient().audio.speech.create({
      model: "tts-1",
      voice: "alloy",
      input: text,
    });

    const buffer = Buffer.from(await response.arrayBuffer());
    await writeFile(filePath, buffer);
    return filePath;
  }

  try {
    const localClient = new OpenAI({
      baseURL: config.TTS_LOCAL_BASE_URL,
      apiKey: "sk-local",
    });
    const response = await localClient.audio.speech.create({
      model: "tts-1",
      voice: "alloy",
      input: text,
    });
    const buffer = Buffer.from(await response.arrayBuffer());
    await writeFile(filePath, buffer);
    return filePath;
  } catch (err) {
    logger.warn(`Local TTS failed: ${err}`);
    return "";
  }
}
