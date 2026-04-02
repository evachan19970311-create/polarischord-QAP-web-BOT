const { Client, GatewayIntentBits, Events } = require("discord.js");
const axios = require("axios");

require('dotenv').config(); // .envファイルから環境変数を読み込む

// =======================
// 設定
// =======================
const CONFIG = {
  DISCORD_TOKEN: process.env.DISCORD_TOKEN,
  GAS_URL: process.env.GAS_URL,
  GAS_SHARED_SECRET: process.env.GAS_SHARED_SECRET,
  SONG_CACHE_TTL_MS: Number(process.env.SONG_CACHE_TTL_MS || 10 * 60 * 1000),
};

validateConfig_(CONFIG);

// =======================
// HTTPクライアント
// =======================
const gasClient = axios.create({
  baseURL: CONFIG.GAS_URL,
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
  },
});

// =======================
// Discordクライアント
// =======================
const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

// =======================
// 楽曲キャッシュ
// =======================
const songStore = {
  items: [],
  loadedAt: 0,
};

function validateConfig_(config) {
  const requiredKeys = ["DISCORD_TOKEN", "GAS_URL", "GAS_SHARED_SECRET"];
  const missing = requiredKeys.filter((key) => !config[key]);

  if (missing.length > 0) {
    throw new Error(`環境変数不足: ${missing.join(", ")}`);
  }
}

function normalizeText_(value) {
  return String(value || "").trim().toLowerCase();
}

function validateDateFormat_(value) {
  if (!/^\d{2}\/\d{2}\/\d{2}$/.test(String(value || "").trim())) {
    throw new Error("date は YY/MM/DD 形式で入力してください");
  }
}

async function fetchSongs_() {
  const response = await gasClient.get("", {
    params: {
      type: "qapdata",
      secret: CONFIG.GAS_SHARED_SECRET,
    },
  });

  if (!Array.isArray(response.data)) {
    throw new Error("楽曲一覧のレスポンス形式が不正です");
  }

  return response.data.map((song) => ({
    id: String(song.music_id),
    name: String(song.music_title),
    searchKey: normalizeText_(song.music_title),
  }));
}

async function ensureSongsLoaded_(force = false) {
  const now = Date.now();
  const isExpired = now - songStore.loadedAt > CONFIG.SONG_CACHE_TTL_MS;

  if (!force && songStore.items.length > 0 && !isExpired) {
    return songStore.items;
  }

  const songs = await fetchSongs_();
  songStore.items = songs;
  songStore.loadedAt = now;

  console.log(`楽曲読み込み完了: ${songs.length}`);
  return songs;
}

function getRequiredOption_(interaction, name) {
  const value = interaction.options.getString(name);
  if (!value || !String(value).trim()) {
    throw new Error(`${name} は必須です`);
  }
  return String(value).trim();
}

function getOptionalOption_(interaction, name) {
  const value = interaction.options.getString(name);
  return value ? String(value).trim() : "";
}

async function handleAutocomplete_(interaction) {
  if (interaction.commandName !== "qap") return;

  try {
    await ensureSongsLoaded_();

    const focused = normalizeText_(interaction.options.getFocused());
    const filtered = songStore.items
      .filter((song) => song.searchKey.includes(focused))
      .slice(0, 25)
      .map((song) => ({
        name: song.name.length > 100 ? song.name.slice(0, 97) + "..." : song.name,
        value: song.id,
      }));

    await interaction.respond(filtered);
  } catch (error) {
    console.error("autocomplete error:", error);
    if (!interaction.responded) {
      await interaction.respond([]);
    }
  }
}

async function handleQapCommand_(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const musicId = getRequiredOption_(interaction, "song");
  const diff = getRequiredOption_(interaction, "diff");
  const dateInput = getRequiredOption_(interaction, "date");

  validateDateFormat_(dateInput);

  await ensureSongsLoaded_();

  let song = songStore.items.find((item) => item.id === musicId);

  // キャッシュずれ対策
  if (!song) {
    await ensureSongsLoaded_(true);
    song = songStore.items.find((item) => item.id === musicId);
  }

  if (!song) {
    await interaction.editReply("楽曲が見つかりません。楽曲マスタを更新してから再試行してください。");
    return;
  }

  const payload = {
    secret: CONFIG.GAS_SHARED_SECRET,
    music_id: song.id,
    music_title: song.name,
    diff,
    date_input: dateInput,
    name1: getRequiredOption_(interaction, "name1"),
    name2: getRequiredOption_(interaction, "name2"),
    name3: getRequiredOption_(interaction, "name3"),
    name4: getRequiredOption_(interaction, "name4"),
    crewid1: getOptionalOption_(interaction, "crewid1"),
    crewid2: getOptionalOption_(interaction, "crewid2"),
    crewid3: getOptionalOption_(interaction, "crewid3"),
    crewid4: getOptionalOption_(interaction, "crewid4"),
  };

  try {
    const response = await gasClient.post("", payload);

    if (response.data && response.data.ok === false) {
      throw new Error(response.data.error || "GAS側でエラーが発生しました");
    }

    await interaction.editReply(
      `登録完了\n曲名: ${song.name}\n難易度: ${diff}\n日付: ${dateInput}`
    );
  } catch (error) {
    console.error("qap post error:", error?.response?.data || error);
    await interaction.editReply("登録中にエラーが発生しました。入力値またはGASログを確認してください。");
  }
}

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`ログイン成功: ${readyClient.user.tag}`);

  try {
    await ensureSongsLoaded_(true);
  } catch (error) {
    console.error("起動時の楽曲読み込み失敗:", error);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isAutocomplete()) {
    return handleAutocomplete_(interaction);
  }

  if (!interaction.isChatInputCommand()) {
    return;
  }

  try {
    switch (interaction.commandName) {
      case "qap":
        await handleQapCommand_(interaction);
        break;
      default:
        break;
    }
  } catch (error) {
    console.error("interaction error:", error);

    const message = "エラーが発生しました";
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(message).catch(() => {});
    } else {
      await interaction.reply({ content: message, ephemeral: true }).catch(() => {});
    }
  }
});

process.on("unhandledRejection", (reason) => {
  console.error("unhandledRejection:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("uncaughtException:", error);
});

client.login(CONFIG.DISCORD_TOKEN);
