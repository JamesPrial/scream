#!/usr/bin/env node
// Discord voice channel scream bot
// Usage: node scream.mjs <guildId> [channelId]
// If channelId is omitted, joins the first populated voice channel in the guild.

import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
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

// --- Dynamic scream generation ---
function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function randInt(min, max) {
  return Math.floor(rand(min, max + 1));
}

function randomizeParams() {
  return {
    duration: rand(2.5, 4.0),
    // Layer 1: primary scream with frequency jumps
    l1Base: rand(300, 700),
    l1Range: rand(800, 2500),
    l1JumpRate: rand(5, 15),
    l1Amp: rand(0.3, 0.5),
    l1Rise: rand(0.5, 2.0),
    l1Seed: randInt(1, 9999),
    // Layer 2: harmonic sweep + jumps
    l2Base: rand(200, 500),
    l2SweepRate: rand(300, 900),
    l2Range: rand(400, 1200),
    l2JumpRate: rand(3, 10),
    l2Amp: rand(0.15, 0.3),
    l2Seed: randInt(1, 9999),
    // Layer 3: high shriek with fast jumps
    l3Base: rand(900, 1800),
    l3Range: rand(800, 2400),
    l3JumpRate: rand(10, 25),
    l3Amp: rand(0.15, 0.3),
    l3Rise: rand(1.0, 3.0),
    l3Seed: randInt(1, 9999),
    // Layer 4: noise bursts
    l4BurstRate: rand(3, 12),
    l4Threshold: rand(0.5, 0.85),
    l4Amp: rand(0.1, 0.25),
    l4Seed: randInt(1, 9999),
    // Layer 5: background noise
    l5Amp: rand(0.05, 0.15),
    // Post-processing
    crusherBits: randInt(6, 12),
    crusherMix: rand(0.3, 0.7),
    compRatio: rand(4, 12),
    volumeBoost: rand(6, 12),
    hpCutoff: rand(80, 200),
    lpCutoff: rand(6000, 12000),
  };
}

function generateScreamStream() {
  const p = randomizeParams();

  // Each layer uses random(floor(t*jumpRate)*mult+seed) to create stepped frequency jumps.
  // random() in ffmpeg aevalsrc returns 0..1, so we scale it to a frequency range.
  const layer1 = `${p.l1Amp}*(1+${p.l1Rise}*t)*sin(2*PI*t*(${p.l1Base}+${p.l1Range}*random(floor(t*${p.l1JumpRate})*137+${p.l1Seed})))`;
  const layer2 = `${p.l2Amp}*sin(2*PI*t*(${p.l2Base}+${p.l2SweepRate}*t+${p.l2Range}*random(floor(t*${p.l2JumpRate})*251+${p.l2Seed})))`;
  const layer3 = `${p.l3Amp}*(1+${p.l3Rise}*t)*sin(2*PI*t*(${p.l3Base}+${p.l3Range}*random(floor(t*${p.l3JumpRate})*89+${p.l3Seed})))`;
  const layer4 = `${p.l4Amp}*(random(floor(t*${p.l4BurstRate})*173+${p.l4Seed})>${p.l4Threshold})*(2*random(t*48000)-1)`;
  const layer5 = `${p.l5Amp}*(2*random(t*48000+7777)-1)`;

  const expr = `${layer1}+${layer2}+${layer3}+${layer4}+${layer5}`;

  const ffmpeg = spawn('ffmpeg', [
    '-f', 'lavfi',
    '-i', `aevalsrc=${expr}:s=48000:d=${p.duration.toFixed(2)}`,
    // Post-processing filter chain
    '-af', [
      `highpass=f=${p.hpCutoff.toFixed(0)}`,
      `lowpass=f=${p.lpCutoff.toFixed(0)}`,
      `acrusher=bits=${p.crusherBits}:mix=${p.crusherMix.toFixed(2)}:mode=log:aa=1`,
      `acompressor=ratio=${p.compRatio.toFixed(0)}:attack=5:release=50:threshold=-20dB`,
      `volume=${p.volumeBoost.toFixed(1)}dB`,
      'alimiter=limit=0.95:attack=1:release=10',
    ].join(','),
    '-c:a', 'libopus',
    '-b:a', '96k',
    '-vbr', 'off',
    '-f', 'ogg',
    '-page_duration', '20000',
    'pipe:1',
  ], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  ffmpeg.stderr.on('data', (chunk) => {
    const msg = chunk.toString().trim();
    if (msg) console.error(`[ffmpeg] ${msg}`);
  });

  ffmpeg.on('error', (err) => {
    console.error('FFmpeg spawn error:', err.message);
  });

  console.log(`Generating scream: ${p.duration.toFixed(2)}s, crusher=${p.crusherBits}bit, boost=${p.volumeBoost.toFixed(1)}dB`);

  return ffmpeg.stdout;
}

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
  const resource = createAudioResource(generateScreamStream(), {
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
