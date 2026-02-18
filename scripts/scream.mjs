#!/usr/bin/env node
// Discord voice channel scream bot
// Usage: node scream.mjs <guildId> [channelId]
// If channelId is omitted, joins the first populated voice channel in the guild.

import { readFileSync, createReadStream } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { Client, GatewayIntentBits } from 'discord.js';
import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  NoSubscriberBehavior,
  StreamType,
} from '@discordjs/voice';

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- Config ---
const AUDIO_FILE = join(__dirname, '..', 'audio', 'scream.ogg');
const CONNECT_TIMEOUT_MS = 15_000;
const READY_TIMEOUT_MS = 15_000;

// --- Resolve bot token ---
function getToken() {
  // 1. Environment variable
  if (process.env.DISCORD_TOKEN) return process.env.DISCORD_TOKEN;

  // 2. Read from openclaw.json
  const configPath = join(process.env.HOME, '.openclaw', 'openclaw.json');
  try {
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    const token = config?.channels?.discord?.token;
    if (token) return token;
  } catch { /* fall through */ }

  console.error('Error: No Discord token found. Set DISCORD_TOKEN or configure channels.discord.token in openclaw.json');
  process.exit(1);
}

// --- Parse args ---
const [guildId, channelId] = process.argv.slice(2);
if (!guildId) {
  console.error('Usage: node scream.mjs <guildId> [channelId]');
  process.exit(1);
}

const token = getToken();

// --- Create client ---
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

// Safety: force exit after 30s no matter what
const forceExitTimer = setTimeout(() => {
  console.error('Force exit: timed out after 30s');
  process.exit(1);
}, 30_000);
forceExitTimer.unref();

async function scream(readyPromise) {
  // Wait for the client to be ready
  await readyPromise;
  console.log(`Logged in as ${client.user.tag}`);

  // Resolve guild
  const guild = client.guilds.cache.get(guildId);
  if (!guild) {
    console.error(`Error: Guild ${guildId} not found. Is the bot in this server?`);
    process.exit(1);
  }

  // Resolve voice channel
  let targetChannelId = channelId;
  if (!targetChannelId) {
    // Find the first voice channel with members in it
    const voiceChannels = guild.channels.cache.filter(
      ch => ch.isVoiceBased() && ch.members.size > 0
    );
    if (voiceChannels.size === 0) {
      console.error('Error: No populated voice channels found in this guild.');
      process.exit(1);
    }
    const target = voiceChannels.first();
    targetChannelId = target.id;
    console.log(`Auto-detected voice channel: #${target.name} (${targetChannelId}) with ${target.members.size} member(s)`);
  }

  // Join the voice channel
  console.log(`Joining voice channel ${targetChannelId} in guild ${guildId}...`);
  const connection = joinVoiceChannel({
    channelId: targetChannelId,
    guildId: guildId,
    adapterCreator: guild.voiceAdapterCreator,
    daveEncryption: false,
  });

  try {
    // Wait for the connection to be ready
    await entersState(connection, VoiceConnectionStatus.Ready, CONNECT_TIMEOUT_MS);
    console.log('Connected to voice channel.');
  } catch (err) {
    console.error('Error: Failed to connect to voice channel:', err.message);
    connection.destroy();
    process.exit(1);
  }

  // Create audio player and resource
  const player = createAudioPlayer({
    behaviors: { noSubscriber: NoSubscriberBehavior.Play },
  });
  const resource = createAudioResource(createReadStream(AUDIO_FILE), {
    inputType: StreamType.OggOpus,
  });

  // Subscribe connection to player
  connection.subscribe(player);

  // Play the scream
  console.log('Playing scream...');
  player.play(resource);

  // Wait for playback to finish
  await new Promise((resolve) => {
    player.on(AudioPlayerStatus.Idle, resolve);
    player.on('error', (err) => {
      console.error('Player error:', err.message);
      resolve();
    });
  });

  console.log('Playback complete.');

  // Brief pause to ensure last packets are transmitted
  await sleep(500);

  // Disconnect
  connection.destroy();
  console.log('Disconnected from voice channel.');
}

// Run — create ready promise BEFORE login to avoid race condition
const readyPromise = new Promise((resolve, reject) => {
  client.once('ready', resolve);
  client.once('error', reject);
  setTimeout(() => reject(new Error('Client ready timeout')), READY_TIMEOUT_MS);
});
client.login(token);
scream(readyPromise)
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  })
  .finally(() => {
    client.destroy();
    clearTimeout(forceExitTimer);
    process.exit(0);
  });
