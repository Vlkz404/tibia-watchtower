import { SlashCommandBuilder } from 'discord.js';

export const commands = [
  new SlashCommandBuilder().setName('ping').setDescription('Checks whether the bot is responding.'),
  new SlashCommandBuilder().setName('status').setDescription('Shows the bot and monitoring status.'),
].map((command) => command.toJSON());
