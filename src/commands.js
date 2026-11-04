import { SlashCommandBuilder } from 'discord.js';

export const commands = [
  new SlashCommandBuilder().setName('ping').setDescription('Verifica se o bot está respondendo.'),
  new SlashCommandBuilder().setName('status').setDescription('Mostra o estado do bot e do monitoramento.'),
].map((command) => command.toJSON());
