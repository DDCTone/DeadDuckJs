import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const ducksCollection = defineCollection({
  loader: glob({
    pattern: '**/*.json',
    base: './src/collections/ducks'
  }),
  schema: z.object({
    tokenId: z.string(),
    name: z.string(),
    image: z.string(),
    attributes: z.array(z.object({
      value: z.string(),
      trait_type: z.string()
    })),
    gameData: z.object({
      backstory: z.string(),
      class: z.string(),
      name: z.string(),
      personality: z.string(),
      specialAbility: z.object({
        description: z.string(),
        name: z.string()
      }),
      stats: z.object({
        agility: z.number(),
        intelligence: z.number(),
        luck: z.number(),
        strength: z.number()
      }),
      rarity: z.string(),
      traits: z.array(z.object({
        type: z.string(),
        value: z.string(),
        rarity: z.string()
      })),
      generatedAt: z.string()
    }),
    // New fields for X posting status (all made optional with .optional())
    postedToX: z.boolean().optional(),
    postedToXAt: z.string().optional(),
    tweetId: z.string().optional()
  })
});

export const collections = {
  'ducks': ducksCollection,
};