# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands
- `npm run dev` - Start local dev server at localhost:4321
- `npm run build` - Build the production site to ./dist/
- `npm run preview` - Preview build locally before deploying
- `npm run astro [command]` - Run Astro CLI commands

## Scripts
- `node scripts/getDucks.mjs` - Download duck metadata and images
- `node scripts/compressDucks.mjs` - Compress duck images to webp format

## Code Style Guidelines
- Use TypeScript with strict type checking
- Follow Astro's component structure and lifecycle
- Use 2-space indentation
- Use ES module imports
- Use async/await for asynchronous operations
- Handle errors with try/catch blocks and descriptive error messages
- Use descriptive variable and function names
- Add JSDoc-style comments for scripts and utility functions
- Follow Astro's file organization:
  - `/public` for static assets
  - `/src/components` for Astro components
  - `/src/layouts` for layout templates
  - `/src/pages` for page components
  - `/src/collections` for content collections