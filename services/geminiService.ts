import { GoogleGenAI, Type } from "@google/genai";
import { Clip, GeminiAnalysis } from "../types";

export const generateProjectMetadata = async (clips: Clip[]): Promise<GeminiAnalysis> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  if (clips.length === 0) {
    throw new Error("No clips in timeline to analyze.");
  }

  const clipDescriptions = clips
    .sort((a, b) => a.offset - b.offset)
    .map(c => `- ${c.name} (Duration: ${(c.end - c.start).toFixed(1)}s)`)
    .join("\n");

  const prompt = `
    I am editing a video project with the following sequence of clips:
    ${clipDescriptions}

    Based on these clip names and their order, generate a creative Title, a short Description (max 2 sentences), and 3 relevant Tags for this video.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            description: { type: Type.STRING },
            tags: { 
              type: Type.ARRAY,
              items: { type: Type.STRING }
            }
          },
          required: ["title", "description", "tags"]
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from Gemini");
    
    return JSON.parse(text) as GeminiAnalysis;

  } catch (error) {
    console.error("Gemini API Error:", error);
    return {
      title: "Untitled Project",
      description: "Could not generate description.",
      tags: []
    };
  }
};