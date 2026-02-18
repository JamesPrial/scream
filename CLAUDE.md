# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

An OpenClaw skill that joins a Discord voice channel, plays a dynamically generated scream, and disconnects. Each invocation produces a unique scream via FFmpeg's `aevalsrc` with randomized sine wave layers, frequency jumps, and post-processing.

## Running

```bash
# Entry point (loads .env, then runs the node script)
scripts/scream.sh <guildId> [channelId]

# Direct node invocation
node scripts/scream.mjs <guildId> [channelId]

# Install dependencies
npm install
```

Requires `DISCORD_TOKEN` env var or `channels.discord.token` in `~/.openclaw/openclaw.json`.

## Architecture

- **`scripts/scream.sh`** — Shell wrapper that sources `~/.openclaw/.env` then execs the node script.
- **`scripts/scream.mjs`** — Single-file bot. Logs in to Discord, resolves guild/channel, joins voice, spawns FFmpeg to generate a randomized scream as OGG/Opus, pipes it to the discord.js audio player, then disconnects. All audio generation logic (5 layered aevalsrc expressions, randomization, post-processing chain) lives here.
- **`audio/generate.sh`** — Reference script showing the original static scream generation approach. Not used at runtime.
- **`audio/scream.ogg`** — Legacy static scream file. Kept in repo but no longer used.
- **`SKILL.md`** — OpenClaw skill manifest with frontmatter metadata (name, description, requirements).

## Key Details

- ESM (`"type": "module"` in package.json)
- Runtime dependency on `ffmpeg` being on PATH (with `libopus` encoder)
- 30-second hard timeout (`forceExitTimer`) kills the process if anything hangs
- Audio is generated at 48kHz mono, encoded to Opus 96kbps, piped as OGG to discord.js `StreamType.OggOpus`
- No tests exist; verification is manual (run the bot, listen to the output)
