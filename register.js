const { REST, Routes, SlashCommandBuilder } = require("discord.js");

require('dotenv').config(); // .envファイルから環境変数を読み込む

const CONFIG = {
  DISCORD_TOKEN: process.env.DISCORD_TOKEN,
  DISCORD_CLIENT_ID: process.env.DISCORD_CLIENT_ID,
  DISCORD_GUILD_ID: process.env.DISCORD_GUILD_ID || "",
};

validateConfig_(CONFIG);

function validateConfig_(config) {
  const requiredKeys = ["DISCORD_TOKEN", "DISCORD_CLIENT_ID"];
  const missing = requiredKeys.filter((key) => !config[key]);

  if (missing.length > 0) {
    throw new Error(`環境変数不足: ${missing.join(", ")}`);
  }
}

const commands = [
  new SlashCommandBuilder()
    .setName("qap")
    .setDescription("QAPデータを登録します")
    .addStringOption((option) =>
      option
        .setName("song")
        .setDescription("楽曲名")
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption((option) =>
      option
        .setName("diff")
        .setDescription("難易度")
        .setRequired(true)
        .addChoices(
          { name: "polar", value: "polar" },
          { name: "inf", value: "inf" },
          { name: "hard", value: "hard" }
        )
    )
    .addStringOption((option) =>
      option
        .setName("date")
        .setDescription("日付 (YY/MM/DD)")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("name1")
        .setDescription("プレイヤー1")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("name2")
        .setDescription("プレイヤー2")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("name3")
        .setDescription("プレイヤー3")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("name4")
        .setDescription("プレイヤー4")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("crewid1")
        .setDescription("クルーID1")
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName("crewid2")
        .setDescription("クルーID2")
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName("crewid3")
        .setDescription("クルーID3")
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName("crewid4")
        .setDescription("クルーID4")
        .setRequired(false)
    )
    .toJSON(),
];

async function main() {
  const rest = new REST({ version: "10" }).setToken(CONFIG.DISCORD_TOKEN);

  const route = CONFIG.DISCORD_GUILD_ID
    ? Routes.applicationGuildCommands(CONFIG.DISCORD_CLIENT_ID, CONFIG.DISCORD_GUILD_ID)
    : Routes.applicationCommands(CONFIG.DISCORD_CLIENT_ID);

  await rest.put(route, { body: commands });

  console.log(
    CONFIG.DISCORD_GUILD_ID
      ? `ギルドコマンド登録完了: guild=${CONFIG.DISCORD_GUILD_ID}`
      : "グローバルコマンド登録完了"
  );
}

main().catch((error) => {
  console.error("コマンド登録失敗:", error);
  process.exit(1);
});
