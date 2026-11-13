import { defineCollection } from "astro:content";
import { docsLoader } from "@astrojs/starlight/loaders";
import { docsSchema } from "@astrojs/starlight/schema";
import { z } from "astro/zod";

export const collections = {
	docs: defineCollection({
		loader: docsLoader(),
		schema: docsSchema({
			extend: z.object({
				/** Where a page copied from a product's repository came from (`scripts/sync.ts`). */
				source: z.object({ product: z.string(), version: z.string(), url: z.url() }).optional(),
			}),
		}),
	}),
};
