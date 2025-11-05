const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder, StringSelectMenuBuilder } = require('discord.js');
const axios = require('axios');
const Database = require('better-sqlite3');

const CONFIG = {
    BOT_TOKEN: process.env.BOT_TOKEN || 'YOUR_BOT_TOKEN_HERE',
    MODQUEUE_URL: process.env.MODQUEUE_URL || 'https://humorous-clarity-production.up.railway.app',
    SECRET_KEY: process.env.SECRET_KEY || 'DEHHOODXTR',
    BOT_OWNER_ID: '715293198741930064',
    LOGS_CHANNEL_ID: '1428200124018065438',
    STATS_CHANNEL_ID: '1428643959554576447',
    GUILD_ID: '1367959540976582809',
    VISITS_VC_ID: '1428648295495897149',
    PLAYING_VC_ID: '1428648220057272330',
    ROBLOX_COOKIE: process.env.ROBLOX_COOKIE || 'YOUR_ROBLOX_COOKIE_HERE',
    GROUP_ID: '33151600',
    PLACE_ID: '94262341273102',
    UNIVERSE_ID: '8955290738'
};

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.DirectMessages] });
const db = new Database('moderation.db');

db.exec(`
    CREATE TABLE IF NOT EXISTS whitelist (discord_id TEXT PRIMARY KEY, rank TEXT NOT NULL, added_by TEXT, added_at INTEGER);
    CREATE TABLE IF NOT EXISTS bans (roblox_id TEXT PRIMARY KEY, username TEXT, reason TEXT, proof TEXT, banned_by TEXT, banned_at INTEGER, expires_at INTEGER);
    CREATE TABLE IF NOT EXISTS warnings (id INTEGER PRIMARY KEY AUTOINCREMENT, roblox_id TEXT, username TEXT, reason TEXT, proof TEXT, warned_by TEXT, warned_at INTEGER);
    CREATE TABLE IF NOT EXISTS punishment_history (id INTEGER PRIMARY KEY AUTOINCREMENT, roblox_id TEXT, username TEXT, action TEXT, reason TEXT, proof TEXT, moderator TEXT, timestamp INTEGER);
    CREATE TABLE IF NOT EXISTS strikes (id INTEGER PRIMARY KEY AUTOINCREMENT, discord_id TEXT, reason TEXT, proof TEXT, issued_by TEXT, issued_at INTEGER);
    CREATE TABLE IF NOT EXISTS blacklisted_crews (group_id TEXT PRIMARY KEY, blacklisted_by TEXT, blacklisted_at INTEGER);
    CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT);
`);

db.prepare('INSERT OR IGNORE INTO whitelist (discord_id, rank, added_by, added_at) VALUES (?, ?, ?, ?)').run(CONFIG.BOT_OWNER_ID, 'owner', 'SYSTEM', Date.now());

function getConfig(key, defaultValue) {
    const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key);
    return row ? row.value : defaultValue;
}

function setConfig(key, value) {
    db.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)').run(key, value);
}

if (!getConfig('PLACE_ID')) setConfig('PLACE_ID', CONFIG.PLACE_ID);
if (!getConfig('UNIVERSE_ID')) setConfig('UNIVERSE_ID', CONFIG.UNIVERSE_ID);

const RANKS = { moderator: 1, admin: 2, manager: 3, owner: 4 };

function hasPermission(userId, requiredRank) {
    if (userId === CONFIG.BOT_OWNER_ID) return true;
    const user = db.prepare('SELECT rank FROM whitelist WHERE discord_id = ?').get(userId);
    if (!user) return false;
    return RANKS[user.rank] >= RANKS[requiredRank];
}

function getUserRank(userId) {
    if (userId === CONFIG.BOT_OWNER_ID) return 'owner';
    const user = db.prepare('SELECT rank FROM whitelist WHERE discord_id = ?').get(userId);
    return user ? user.rank : null;
}

async function getRobloxUserByUsername(username) {
    try {
        const response = await axios.post('https://users.roproxy.com/v1/usernames/users', { usernames: [username] });
        return response.data.data[0] || null;
    } catch (error) {
        return null;
    }
}

async function getRobloxUserById(userId) {
    try {
        const response = await axios.get(`https://users.roproxy.com/v1/users/${userId}`);
        return response.data;
    } catch (error) {
        return null;
    }
}

async function getRobloxUserThumbnail(userId) {
    try {
        const response = await axios.get(`https://thumbnails.roproxy.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=false`);
        if (response.data && response.data.data && response.data.data[0]) {
            return response.data.data[0].imageUrl;
        }
    } catch (error) {}
    return null;
}

async function getGroupThumbnail(groupId) {
    try {
        const response = await axios.get(`https://thumbnails.roproxy.com/v1/groups/icons?groupIds=${groupId}&size=150x150&format=Png&isCircular=false`);
        if (response.data && response.data.data && response.data.data[0]) {
            return response.data.data[0].imageUrl;
        }
    } catch (error) {}
    return null;
}

async function getRobloxUserDetails(userId) {
    try {
        const [user, friends, followers, following] = await Promise.all([
            axios.get(`https://users.roproxy.com/v1/users/${userId}`),
            axios.get(`https://friends.roproxy.com/v1/users/${userId}/friends/count`),
            axios.get(`https://friends.roproxy.com/v1/users/${userId}/followers/count`),
            axios.get(`https://friends.roproxy.com/v1/users/${userId}/followings/count`)
        ]);
        return {
            ...user.data,
            friendCount: friends.data.count,
            followerCount: followers.data.count,
            followingCount: following.data.count
        };
    } catch (error) {
        return null;
    }
}

async function getGameStats() {
    try {
        const universeId = getConfig('UNIVERSE_ID', CONFIG.UNIVERSE_ID);
        const response = await axios.get(`https://games.roproxy.com/v1/games?universeIds=${universeId}`);
        const gameData = response.data.data[0];
        return { playing: gameData.playing, visits: gameData.visits };
    } catch (error) {
        return null;
    }
}

async function getGroupRoles(groupId) {
    try {
        const response = await axios.get(`https://groups.roproxy.com/v1/groups/${groupId}/roles`);
        return response.data.roles;
    } catch (error) {
        return null;
    }
}

async function setGroupRank(groupId, userId, roleId, cookie) {
    try {
        const response = await axios.patch(`https://groups.roblox.com/v1/groups/${groupId}/users/${userId}`, { roleId }, { headers: { Cookie: `.ROBLOSECURITY=${cookie}` } });
        return response.data;
    } catch (error) {
        return null;
    }
}

async function getGroupInfo(groupId) {
    try {
        const response = await axios.get(`https://groups.roproxy.com/v1/groups/${groupId}`);
        return response.data;
    } catch (error) {
        return null;
    }
}

async function sendToModqueue(action, data) {
    try {
        await axios.post(`${CONFIG.MODQUEUE_URL}/command`, { action, data, secret: CONFIG.SECRET_KEY });
        return true;
    } catch (error) {
        return false;
    }
}

async function logToChannel(embed) {
    try {
        const channel = await client.channels.fetch(CONFIG.LOGS_CHANNEL_ID);
        await channel.send({ embeds: [embed] });
    } catch (error) {}
}

async function logToDM(embed) {
    try {
        const owner = await client.users.fetch(CONFIG.BOT_OWNER_ID);
        await owner.send({ embeds: [embed] });
    } catch (error) {}
}

async function logCommand(interaction, action, details) {
    const embed = new EmbedBuilder()
        .setTitle(`Command: ${action}`)
        .setColor('#FF5733')
        .addFields(
            { name: 'Moderator', value: `<@${interaction.user.id}> (${interaction.user.tag})` },
            { name: 'Rank', value: getUserRank(interaction.user.id) || 'Unknown' },
            { name: 'Timestamp', value: `<t:${Math.floor(Date.now() / 1000)}:F>` }
        )
        .setTimestamp();
    
    for (const [key, value] of Object.entries(details)) {
        embed.addFields({ name: key, value: String(value) });
    }
    
    await logToChannel(embed);
    await logToDM(embed);
}

async function createConfirmation(interaction, title, description, fields, thumbnailUrl, imageUrl) {
    const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor('#FFA500')
        .setTimestamp();
    
    if (fields) embed.addFields(fields);
    if (thumbnailUrl) embed.setThumbnail(thumbnailUrl);
    if (imageUrl) embed.setImage(imageUrl);
    
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('confirm').setLabel('Confirm').setStyle(ButtonStyle.Success).setEmoji('✅'),
        new ButtonBuilder().setCustomId('cancel').setLabel('Cancel').setStyle(ButtonStyle.Danger).setEmoji('❌')
    );
    
    const message = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });
    const filter = i => i.user.id === interaction.user.id;
    const collector = message.createMessageComponentCollector({ filter, time: 60000, max: 1 });
    
    return new Promise((resolve) => {
        collector.on('collect', async i => {
            if (i.customId === 'confirm') {
                await i.update({ components: [] });
                resolve(true);
            } else {
                await i.update({ embeds: [new EmbedBuilder().setTitle('Action Cancelled').setColor('#FF0000')], components: [] });
                resolve(false);
            }
        });
        collector.on('end', collected => {
            if (collected.size === 0) {
                interaction.editReply({ embeds: [new EmbedBuilder().setTitle('Action Timed Out').setColor('#FF0000')], components: [] });
                resolve(false);
            }
        });
    });
}

function parseDuration(duration) {
    const regex = /(\d+)([dhm])/g;
    let totalMs = 0;
    let match;
    while ((match = regex.exec(duration)) !== null) {
        const value = parseInt(match[1]);
        const unit = match[2];
        if (unit === 'd') totalMs += value * 24 * 60 * 60 * 1000;
        else if (unit === 'h') totalMs += value * 60 * 60 * 1000;
        else if (unit === 'm') totalMs += value * 60 * 1000;
    }
    return totalMs;
}
const commands = [
    new SlashCommandBuilder().setName('whitelist').setDescription('Add a user to the whitelist').addUserOption(option => option.setName('user').setDescription('User to whitelist').setRequired(true)).addStringOption(option => option.setName('rank').setDescription('Rank to assign').setRequired(true).addChoices({name:'Moderator',value:'moderator'},{name:'Admin',value:'admin'},{name:'Manager',value:'manager'},{name:'Owner',value:'owner'})),
    new SlashCommandBuilder().setName('removewhitelist').setDescription('Remove a user from the whitelist').addUserOption(option => option.setName('user').setDescription('User to remove').setRequired(true)),
    new SlashCommandBuilder().setName('whitelistedusers').setDescription('View all whitelisted users'),
    new SlashCommandBuilder().setName('kick').setDescription('Kick a player from the game').addStringOption(option => option.setName('player').setDescription('Username or UserID').setRequired(true)).addStringOption(option => option.setName('reason').setDescription('Reason for kick').setRequired(true)).addStringOption(option => option.setName('proof').setDescription('Proof/Evidence').setRequired(true)),
    new SlashCommandBuilder().setName('ban').setDescription('Ban a player from the game').addStringOption(option => option.setName('player').setDescription('Username or UserID').setRequired(true)).addStringOption(option => option.setName('reason').setDescription('Reason for ban').setRequired(true)).addStringOption(option => option.setName('proof').setDescription('Proof/Evidence').setRequired(true)),
    new SlashCommandBuilder().setName('unban').setDescription('Unban a player from the game').addStringOption(option => option.setName('player').setDescription('Username or UserID').setRequired(true)).addStringOption(option => option.setName('reason').setDescription('Reason for unban').setRequired(true)).addStringOption(option => option.setName('proof').setDescription('Proof/Evidence').setRequired(true)),
    new SlashCommandBuilder().setName('tempban').setDescription('Temporarily ban a player').addStringOption(option => option.setName('player').setDescription('Username or UserID').setRequired(true)).addStringOption(option => option.setName('duration').setDescription('Duration (e.g., 3d 2h 1m)').setRequired(true)).addStringOption(option => option.setName('reason').setDescription('Reason for tempban').setRequired(true)).addStringOption(option => option.setName('proof').setDescription('Proof/Evidence').setRequired(true)),
    new SlashCommandBuilder().setName('checkban').setDescription('Check if a player is banned').addStringOption(option => option.setName('player').setDescription('Username or UserID').setRequired(true)),
    new SlashCommandBuilder().setName('warn').setDescription('Warn a player').addStringOption(option => option.setName('player').setDescription('Username or UserID').setRequired(true)).addStringOption(option => option.setName('reason').setDescription('Reason for warning').setRequired(true)).addStringOption(option => option.setName('proof').setDescription('Proof/Evidence').setRequired(true)),
    new SlashCommandBuilder().setName('checkwarn').setDescription('Check warnings for a player').addStringOption(option => option.setName('player').setDescription('Username or UserID').setRequired(true)),
    new SlashCommandBuilder().setName('clearwarnings').setDescription('Clear all warnings for a player').addStringOption(option => option.setName('player').setDescription('Username or UserID').setRequired(true)),
    new SlashCommandBuilder().setName('punishmenthistory').setDescription('View punishment history for a player').addStringOption(option => option.setName('player').setDescription('Username or UserID').setRequired(true)),
    new SlashCommandBuilder().setName('bannedusers').setDescription('Get a list of all banned users'),
    new SlashCommandBuilder().setName('unbanwave').setDescription('Unban all banned users'),
    new SlashCommandBuilder().setName('restartallservers').setDescription('Restart all game servers'),
    new SlashCommandBuilder().setName('blacklistcrew').setDescription('Blacklist a Roblox group').addStringOption(option => option.setName('groupid').setDescription('Group ID to blacklist').setRequired(true)),
    new SlashCommandBuilder().setName('removecrewblacklist').setDescription('Remove a group from blacklist').addStringOption(option => option.setName('groupid').setDescription('Group ID to remove').setRequired(true)),
    new SlashCommandBuilder().setName('blacklistedcrews').setDescription('View all blacklisted groups'),
    new SlashCommandBuilder().setName('whois').setDescription('Get detailed information about a Roblox user').addStringOption(option => option.setName('player').setDescription('Username or UserID').setRequired(true)),
    new SlashCommandBuilder().setName('check-ccu').setDescription('Check current concurrent users'),
    new SlashCommandBuilder().setName('viewlogs').setDescription('View moderation logs for a staff member').addUserOption(option => option.setName('user').setDescription('Staff member').setRequired(true)),
    new SlashCommandBuilder().setName('announce').setDescription('Send an announcement to all servers').addStringOption(option => option.setName('message').setDescription('Message to announce').setRequired(true)),
    new SlashCommandBuilder().setName('message').setDescription('Send a message to a specific player').addStringOption(option => option.setName('player').setDescription('Username or UserID').setRequired(true)).addStringOption(option => option.setName('message').setDescription('Message to send').setRequired(true)),
    new SlashCommandBuilder().setName('mute').setDescription('Mute a player in-game').addStringOption(option => option.setName('player').setDescription('Username or UserID').setRequired(true)).addStringOption(option => option.setName('duration').setDescription('Duration (e.g., 1h 30m)').setRequired(true)).addStringOption(option => option.setName('reason').setDescription('Reason for mute').setRequired(true)).addStringOption(option => option.setName('proof').setDescription('Proof/Evidence').setRequired(true)),
    new SlashCommandBuilder().setName('unmute').setDescription('Unmute a player in-game').addStringOption(option => option.setName('player').setDescription('Username or UserID').setRequired(true)).addStringOption(option => option.setName('reason').setDescription('Reason for unmute').setRequired(true)),
    new SlashCommandBuilder().setName('strike').setDescription('Issue a strike to a staff member').addUserOption(option => option.setName('user').setDescription('Staff member').setRequired(true)).addStringOption(option => option.setName('reason').setDescription('Reason for strike').setRequired(true)).addStringOption(option => option.setName('proof').setDescription('Proof/Evidence').setRequired(true)),
    new SlashCommandBuilder().setName('removestrike').setDescription('Remove one strike from a staff member').addUserOption(option => option.setName('user').setDescription('Staff member').setRequired(true)).addStringOption(option => option.setName('reason').setDescription('Reason for removal').setRequired(true)),
    new SlashCommandBuilder().setName('grouprank').setDescription('Change a player\'s group rank').addStringOption(option => option.setName('player').setDescription('Username or UserID').setRequired(true)),
    new SlashCommandBuilder().setName('addcash').setDescription('Add cash to a player').addStringOption(option => option.setName('player').setDescription('Username or UserID').setRequired(true)).addIntegerOption(option => option.setName('amount').setDescription('Amount to add').setRequired(true)),
    new SlashCommandBuilder().setName('removecash').setDescription('Remove cash from a player').addStringOption(option => option.setName('player').setDescription('Username or UserID').setRequired(true)).addIntegerOption(option => option.setName('amount').setDescription('Amount to remove').setRequired(true)),
    new SlashCommandBuilder().setName('setcash').setDescription('Set a player\'s cash').addStringOption(option => option.setName('player').setDescription('Username or UserID').setRequired(true)).addIntegerOption(option => option.setName('amount').setDescription('Amount to set').setRequired(true)),
    new SlashCommandBuilder().setName('changeplaceid').setDescription('Change the Place ID').addStringOption(option => option.setName('placeid').setDescription('New Place ID').setRequired(true)),
    new SlashCommandBuilder().setName('changeuniverseid').setDescription('Change the Universe ID').addStringOption(option => option.setName('universeid').setDescription('New Universe ID').setRequired(true))
];

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);
    try {
        await client.application.commands.set(commands);
        console.log('Slash commands registered!');
    } catch (error) {
        console.error('Error registering commands:', error);
    }
    updateStatus();
    updateVoiceChannels();
    updateStatsChannel();
    setInterval(updateStatus, 10000);
    setInterval(updateVoiceChannels, 10000);
    setInterval(updateStatsChannel, 600000);
});

async function updateStatus() {
    const stats = await getGameStats();
    if (stats) {
        client.user.setActivity(`${stats.playing} players are currently playing Deh Hood`, { type: 'WATCHING' });
    }
}

async function updateVoiceChannels() {
    try {
        const stats = await getGameStats();
        if (!stats) return;
        const guild = await client.guilds.fetch(CONFIG.GUILD_ID);
        const visitsChannel = await guild.channels.fetch(CONFIG.VISITS_VC_ID);
        const playingChannel = await guild.channels.fetch(CONFIG.PLAYING_VC_ID);
        await visitsChannel.setName(`👥 Visits: ${stats.visits.toLocaleString()}`);
        await playingChannel.setName(`🎮 Playing: ${stats.playing.toLocaleString()}`);
    } catch (error) {}
}

async function updateStatsChannel() {
    try {
        const stats = await getGameStats();
        if (!stats) return;
        const milestone = Math.ceil(stats.visits / 10000) * 10000;
        const message = `-------------------------------------------------------\n-------------------------------------------------------\n‍🎮 Active players: ${stats.playing.toLocaleString()}\n-------------------------------------------------------\n-------------------------------------------------------\n👥 Visits: ${stats.visits.toLocaleString()}\n🎯 Next milestone: ${stats.visits.toLocaleString()}/${milestone.toLocaleString()}\n-------------------------------------------------------\n-------------------------------------------------------`;
        const channel = await client.channels.fetch(CONFIG.STATS_CHANNEL_ID);
        await channel.send(message);
    } catch (error) {}
}
client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;
    
    const { commandName } = interaction;
    
    const commandPermissions = {
        whitelist: 'owner', removewhitelist: 'owner', whitelistedusers: 'owner', unbanwave: 'owner', restartallservers: 'owner',
        blacklistcrew: 'owner', removecrewblacklist: 'owner', blacklistedcrews: 'owner', grouprank: 'owner', changeplaceid: 'owner',
        changeuniverseid: 'owner', clearwarnings: 'manager', bannedusers: 'manager', viewlogs: 'manager', announce: 'manager',
        strike: 'manager', removestrike: 'manager', setcash: 'manager', punishmenthistory: 'admin', message: 'admin',
        addcash: 'admin', removecash: 'admin', kick: 'moderator', ban: 'moderator', unban: 'moderator', tempban: 'moderator',
        checkban: 'moderator', warn: 'moderator', checkwarn: 'moderator', mute: 'moderator', unmute: 'moderator',
        whois: 'moderator', 'check-ccu': 'moderator'
    };
    
    const requiredRank = commandPermissions[commandName];
    if (requiredRank && !hasPermission(interaction.user.id, requiredRank)) {
        return interaction.reply({ content: '❌ You do not have permission to use this command.', ephemeral: true });
    }
    
    try {
        if (commandName === 'whitelist') {
            const user = interaction.options.getUser('user');
            const rank = interaction.options.getString('rank');
            db.prepare('INSERT OR REPLACE INTO whitelist (discord_id, rank, added_by, added_at) VALUES (?, ?, ?, ?)').run(user.id, rank, interaction.user.id, Date.now());
            await logCommand(interaction, 'Whitelist', { 'User': `<@${user.id}>`, 'Rank': rank });
            return interaction.reply({ content: `✅ Successfully whitelisted ${user.tag} as **${rank}**`, ephemeral: true });
        }
        
        if (commandName === 'removewhitelist') {
            const user = interaction.options.getUser('user');
            db.prepare('DELETE FROM whitelist WHERE discord_id = ?').run(user.id);
            await logCommand(interaction, 'Remove Whitelist', { 'User': `<@${user.id}>` });
            return interaction.reply({ content: `✅ Successfully removed ${user.tag} from whitelist`, ephemeral: true });
        }
        
        if (commandName === 'whitelistedusers') {
            const users = db.prepare('SELECT * FROM whitelist').all();
            if (users.length === 0) return interaction.reply({ content: '❌ No whitelisted users found.', ephemeral: true });
            const embed = new EmbedBuilder().setTitle('Whitelisted Users').setColor('#00FF00').setTimestamp();
            for (const user of users) {
                embed.addFields({ name: `<@${user.discord_id}>`, value: `**Rank:** ${user.rank}\n**Added:** <t:${Math.floor(user.added_at / 1000)}:R>` });
            }
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }
        
        if (commandName === 'kick') {
            const playerInput = interaction.options.getString('player');
            const reason = interaction.options.getString('reason');
            const proof = interaction.options.getString('proof');
            const user = isNaN(playerInput) ? await getRobloxUserByUsername(playerInput) : await getRobloxUserById(playerInput);
            if (!user) return interaction.reply({ content: '❌ Could not find that Roblox user.', ephemeral: true });
            const thumbnail = await getRobloxUserThumbnail(user.id);
            const confirmed = await createConfirmation(interaction, 'Confirm Kick', `Are you sure you want to kick this player?`, [{ name: 'Username', value: user.name || user.displayName }, { name: 'User ID', value: String(user.id) }, { name: 'Reason', value: reason }, { name: 'Proof', value: proof }], thumbnail, null);
            if (!confirmed) return;
            await sendToModqueue('kick', { userId: user.id, reason });
            db.prepare('INSERT INTO punishment_history (roblox_id, username, action, reason, proof, moderator, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)').run(user.id, user.name || user.displayName, 'Kick', reason, proof, interaction.user.id, Date.now());
            await logCommand(interaction, 'Kick', { 'Player': `${user.name || user.displayName} (${user.id})`, 'Reason': reason, 'Proof': proof });
            return interaction.editReply({ content: `✅ Successfully kicked **${user.name || user.displayName}**`, embeds: [], components: [] });
        }
        
        if (commandName === 'ban') {
            const playerInput = interaction.options.getString('player');
            const reason = interaction.options.getString('reason');
            const proof = interaction.options.getString('proof');
            const user = isNaN(playerInput) ? await getRobloxUserByUsername(playerInput) : await getRobloxUserById(playerInput);
            if (!user) return interaction.reply({ content: '❌ Could not find that Roblox user.', ephemeral: true });
            const thumbnail = await getRobloxUserThumbnail(user.id);
            const confirmed = await createConfirmation(interaction, 'Confirm Ban', `Are you sure you want to ban this player?`, [{ name: 'Username', value: user.name || user.displayName }, { name: 'User ID', value: String(user.id) }, { name: 'Reason', value: reason }, { name: 'Proof', value: proof }], thumbnail, null);
            if (!confirmed) return;
            db.prepare('INSERT OR REPLACE INTO bans (roblox_id, username, reason, proof, banned_by, banned_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(user.id, user.name || user.displayName, reason, proof, interaction.user.id, Date.now(), null);
            await sendToModqueue('ban', { userId: user.id, reason, expiresAt: null });
            db.prepare('INSERT INTO punishment_history (roblox_id, username, action, reason, proof, moderator, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)').run(user.id, user.name || user.displayName, 'Ban', reason, proof, interaction.user.id, Date.now());
            await logCommand(interaction, 'Ban', { 'Player': `${user.name || user.displayName} (${user.id})`, 'Reason': reason, 'Proof': proof });
            return interaction.editReply({ content: `✅ Successfully banned **${user.name || user.displayName}**`, embeds: [], components: [] });
        }
        
        if (commandName === 'unban') {
            const playerInput = interaction.options.getString('player');
            const reason = interaction.options.getString('reason');
            const proof = interaction.options.getString('proof');
            const user = isNaN(playerInput) ? await getRobloxUserByUsername(playerInput) : await getRobloxUserById(playerInput);
            if (!user) return interaction.reply({ content: '❌ Could not find that Roblox user.', ephemeral: true });
            const thumbnail = await getRobloxUserThumbnail(user.id);
            const confirmed = await createConfirmation(interaction, 'Confirm Unban', `Are you sure you want to unban this player?`, [{ name: 'Username', value: user.name || user.displayName }, { name: 'User ID', value: String(user.id) }, { name: 'Reason', value: reason }, { name: 'Proof', value: proof }], thumbnail, null);
            if (!confirmed) return;
            db.prepare('DELETE FROM bans WHERE roblox_id = ?').run(user.id);
            await sendToModqueue('unban', { userId: user.id });
            db.prepare('INSERT INTO punishment_history (roblox_id, username, action, reason, proof, moderator, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)').run(user.id, user.name || user.displayName, 'Unban', reason, proof, interaction.user.id, Date.now());
            await logCommand(interaction, 'Unban', { 'Player': `${user.name || user.displayName} (${user.id})`, 'Reason': reason, 'Proof': proof });
            return interaction.editReply({ content: `✅ Successfully unbanned **${user.name || user.displayName}**`, embeds: [], components: [] });
        }
        
        if (commandName === 'tempban') {
            const playerInput = interaction.options.getString('player');
            const duration = interaction.options.getString('duration');
            const reason = interaction.options.getString('reason');
            const proof = interaction.options.getString('proof');
            const user = isNaN(playerInput) ? await getRobloxUserByUsername(playerInput) : await getRobloxUserById(playerInput);
            if (!user) return interaction.reply({ content: '❌ Could not find that Roblox user.', ephemeral: true });
            const durationMs = parseDuration(duration);
            const expiresAt = Date.now() + durationMs;
            const thumbnail = await getRobloxUserThumbnail(user.id);
            const confirmed = await createConfirmation(interaction, 'Confirm Temporary Ban', `Are you sure you want to temporarily ban this player?`, [{ name: 'Username', value: user.name || user.displayName }, { name: 'User ID', value: String(user.id) }, { name: 'Duration', value: duration }, { name: 'Expires', value: `<t:${Math.floor(expiresAt / 1000)}:F>` }, { name: 'Reason', value: reason }, { name: 'Proof', value: proof }], thumbnail, null);
            if (!confirmed) return;
            db.prepare('INSERT OR REPLACE INTO bans (roblox_id, username, reason, proof, banned_by, banned_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(user.id, user.name || user.displayName, reason, proof, interaction.user.id, Date.now(), expiresAt);
            await sendToModqueue('ban', { userId: user.id, reason, expiresAt });
            db.prepare('INSERT INTO punishment_history (roblox_id, username, action, reason, proof, moderator, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)').run(user.id, user.name || user.displayName, `Tempban (${duration})`, reason, proof, interaction.user.id, Date.now());
            await logCommand(interaction, 'Tempban', { 'Player': `${user.name || user.displayName} (${user.id})`, 'Duration': duration, 'Expires': `<t:${Math.floor(expiresAt / 1000)}:F>`, 'Reason': reason, 'Proof': proof });
            return interaction.editReply({ content: `✅ Successfully temp-banned **${user.name || user.displayName}** for ${duration}`, embeds: [], components: [] });
        }
        
        if (commandName === 'checkban') {
            const playerInput = interaction.options.getString('player');
            const user = isNaN(playerInput) ? await getRobloxUserByUsername(playerInput) : await getRobloxUserById(playerInput);
            if (!user) return interaction.reply({ content: '❌ Could not find that Roblox user.', ephemeral: true });
            const ban = db.prepare('SELECT * FROM bans WHERE roblox_id = ?').get(user.id);
            if (!ban) return interaction.reply({ content: `✅ **${user.name || user.displayName}** is not banned.`, ephemeral: true });
            const thumbnail = await getRobloxUserThumbnail(user.id);
            const embed = new EmbedBuilder().setTitle('Ban Information').setColor('#FF0000').setThumbnail(thumbnail).addFields({ name: 'Username', value: ban.username }, { name: 'User ID', value: ban.roblox_id }, { name: 'Reason', value: ban.reason }, { name: 'Proof', value: ban.proof }, { name: 'Banned By', value: `<@${ban.banned_by}>` }, { name: 'Banned At', value: `<t:${Math.floor(ban.banned_at / 1000)}:F>` });
            if (ban.expires_at) embed.addFields({ name: 'Expires At', value: `<t:${Math.floor(ban.expires_at / 1000)}:F>` });
            else embed.addFields({ name: 'Type', value: 'Permanent' });
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }
