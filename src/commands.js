import { SlashCommandBuilder } from 'discord.js';

export const commands = [
  new SlashCommandBuilder().setName('ping').setDescription('Checks whether the bot is responding.'),
  new SlashCommandBuilder().setName('status').setDescription('Shows bot and monitoring status.'),
  new SlashCommandBuilder().setName('dashboard').setDescription('Opens settings and your personal DM subscription.'),
  new SlashCommandBuilder().setName('player').setDescription('Shows a tracked player or the monitoring summary.').addStringOption((option) =>
    option.setName('name').setDescription('Name of a player already added to the dashboard.').setMaxLength(29)),
  new SlashCommandBuilder().setName('notifications').setDescription('Manages your own DM alert subscription.').addStringOption((option) =>
    option.setName('action').setDescription('Choose a subscription action.').setRequired(true).addChoices(
      { name: 'Enable my DMs', value: 'enable' },
      { name: 'Disable my DMs', value: 'disable' },
      { name: 'Show my subscription', value: 'status' },
    )),
].map((command) => command.toJSON());
