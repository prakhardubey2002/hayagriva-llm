---
name: hayagriva-metadata
description: "Use this skill when generating structured LLM metadata files (llm.package.json, llm.package.txt) for Node.js packages, creating coding agent operating manuals (AGENT.md), producing Cursor IDE rules (.mdc files), running AI readiness audits, or starting local observability dashboards. Trigger terms: hayagriva, llm metadata, llm.package.json, llm.package.txt, AGENT.md generation, agent manual, Cursor rules, .mdc files, AI readiness score, AI audit, static analysis, ts-morph, OpenRouter, package metadata, machine-readable package context."
---

# Hayagriva LLM Metadata Generator

<!-- hayagriva-llm: edit the sections below. Safe to change headings, bullets, and add files in this skill folder. -->

## Instructions

- Identify the target command from the user's request: generate, agent, audit, dashboard, or help
- Map the request to the correct CLI invocation with appropriate options (--mode, --api-key, --model, --freellmrouter, --rule, --dir, --out, --force, --verbose, --port, --include-src)
- Validate that required dependencies (OpenRouter API key, Node.js 18+) are available or note them as prerequisites
- Explain the output files produced (llm.package.json, llm.package.txt, AGENT.md, .cursor/rules/*.mdc) and their expected locations
- Mention the mode selection tradeoff: static (ts-morph, no API key needed) vs ai (OpenRouter, higher quality but requires authentication)
- Include relevant environment variables (OPENROUTER_API_KEY, OPEN_ROUTER_MODEL, FREE_LLM_ROUTER_API_KEY, HAYAGRIVA_LLM_MODEL) when configuring API-based workflows
- For audit commands, explain the AI Readiness Score breakdown and actionable improvement suggestions
- Reference the local dashboard (default localhost:4177) for metadata inspection workflows

## Workflow

1. Determine whether the user needs metadata generation, agent manual creation, AI readiness auditing, or dashboard serving
2. Select the appropriate hayagriva-llm or hayagriva subcommand and relevant flags based on the task
3. Verify prerequisites: Node.js 18+ installation, optional API keys for AI mode, familiarity with the target package structure
4. Construct the CLI command with required and optional arguments matching the user's configuration preferences
5. Describe expected outputs including file paths, format, and how the generated files improve LLM and AI tooling interpretability
6. Provide integration guidance for CI/CD pipelines, npm scripts, or IDE-specific workflows (Cursor, GitHub Copilot) where applicable

## Examples

- Generating static LLM metadata for an npm package without API keys: suggest 'hayagriva-llm generate --mode static --verbose' with explanation of tc-morph analysis output
- Creating a coding agent manual with Cursor rules and AI-enhanced metadata: suggest 'hayagriva-llm generate --mode ai --api-key $OPENROUTER_API_KEY --rule' followed by 'hayagriva-llm agent --out AGENT.md --force'
- Auditing a Node.js package's AI readiness and serving results locally: suggest 'hayagriva-llm audit --dir .' and 'hayagriva-llm dashboard --port 4177' with score interpretation

## Additional resources

- https://github.com/prakhardubey2002/hayagriva-llm#readme
- https://deepwiki.com/prakhardubey2002/hayagriva-llm

## Your notes

This project uses microbundle for dual CJS/ESM distribution, vitest for testing, and tsup-style builds. When suggesting commands, prefer the shorter 'hayagriva' alias over 'hayagriva-llm' for interactive use. The free LLM Router option (--freellmrouter) does not require OpenRouter paid plans — users should set FREE_LLM_ROUTER_API_KEY from freellmrouter.com.
