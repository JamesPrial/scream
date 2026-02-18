---
name: scream
description: "Join a Discord voice channel and play a scream sound. Use when a user says 'scream', 'scream in voice', 'join voice and scream', 'AAAA', 'go scream', or asks you to make noise in a voice channel."
metadata: { "openclaw": { "emoji": "😱", "requires": { "bins": ["node"], "config": ["channels.discord.token"] } } }
---

# Discord Voice Scream

Join a Discord voice channel, play a synthetic scream, and leave.

## Run

```bash
{baseDir}/scripts/scream.sh <guildId> [channelId]
```

- **guildId** (required): Discord guild/server ID.
- **channelId** (optional): Voice channel ID. Omit to auto-join the first populated voice channel.

## Getting IDs

Extract `guildId` from the incoming Discord message context. If the user is in a voice channel, pass their channel ID as `channelId`.

## Dependencies

If `{baseDir}/node_modules` is missing, install first:

```bash
cd {baseDir} && npm install
```

## Requirements

- Bot needs **Guild Voice States** intent enabled in the Discord Developer Portal.
- Bot needs **Connect** and **Speak** permissions in the target voice channel.
