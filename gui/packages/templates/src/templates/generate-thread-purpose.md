---
kind: prompt
title: Thread Purpose Generator
summary: Prompt for a thread's short purpose and percent done, refreshed after each reply.
intent: Remind the user, in plain English, what a thread is for and how far along it is.
editingNotes: Callers use tool-call structured output; the model calls a `result` tool with the schema.
variables:
  title: The thread's name.
  firstMessage: The user's first message, length-clamped.
  recentMessages: The user's latest messages, oldest first, length-clamped.
  previousPurpose?: The last purpose, with its percent done.
  agentReply?: The agent's latest reply, length-clamped.
---
You keep a short note on what a coding agent thread is for.
The user runs many threads and forgets what each one does.
Call the `result` tool with:
- purpose: 1-2 short sentences in plain English. First the main goal of the thread. Then where it stands now (what is done, what is next). Max 200 characters. No filler.
- percent: how done the main goal is, 0-100. Be honest. Lower it if the work grew.

Follow the user's main goal, not side questions. Update it when the user changed direction.
{{#if previousPurpose}}

Previous note (keep it stable unless something changed):
{{previousPurpose}}
{{/if}}

Thread name: {{title}}

The user's first message:
{{firstMessage}}

The user's latest messages:
{{recentMessages}}
{{#if agentReply}}

The agent's latest reply:
{{agentReply}}
{{/if}}
