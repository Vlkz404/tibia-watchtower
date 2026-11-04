import { SlashCommandBuilder } from 'discord.js';

export const commands = [
  new SlashCommandBuilder().setName('ping').setDescription('Checks whether the bot is responding.'),
  new SlashCommandBuilder().setName('status').setDescription('Shows the bot and monitoring status.'),
  new SlashCommandBuilder().setName('dashboard').setDescription('Open server settings or your personal DM subscription.'),
  new SlashCommandBuilder().setName('notifications').setDescription('Manage your own DM subscription.').addStringOption((option) => option.setName('action').setDescription('Subscription action').setRequired(true).addChoices({ name: 'Subscribe', value: 'enable' }, { name: 'Unsubscribe', value: 'disable' }, { name: 'Show subscription', value: 'status' })),
].map((command) => command.toJSON());
