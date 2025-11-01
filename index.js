const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder, PermissionFlagsBits, SelectMenuBuilder, StringSelectMenuBuilder } = require('discord.js');
const axios = require('axios');
const fs = require('fs');
const Database = require('better-sqlite3');

// Configuration
const CONFIG = {
    BOT_TOKEN: process.env.BOT_TOKEN,
    MODQUEUE_URL: 'https://fortunate-success-production.up.railway.app',
    SECRET_KEY: 'DEHHOODXTR',
    BOT_OWNER_ID: '715293198741930064',
    LOGS_CHANNEL_ID: '1428200124018065438',
    STATS_CHANNEL_ID: '1428643959554576447',
    GUILD_ID: '1367959540976582809',
    VISITS_VC_ID: '1428648295495897149',
    PLAYING_VC_ID: '1428648220057272330',
    ROBLOX_COOKIE: '_|WARNING:-DO-NOT-SHARE-THIS.--Sharing-this-will-allow-someone-to-log-in-as-you-and-to-steal-your-ROBUX-and-items.|_CAEaAhAC.KxBWPiYE3VjPi4P19Kluv1dzAOEtM0XRkQ3bFFJv_DFlPRiYl__SnyVfKVHs5s3ANuMXbe3XB921tCg4qJCuWSBrrm6ficdbBiqN7OkUnM--RFH5XNmEmXfnYiNqKCqCzIY54-JrPP49_MIm5g-0FknQb2KRsdx904SbeEo7Uz0mEeKtGnhoe6_WUuCTGu6LTdweEKQ7-Thw88HIr0r4gwTynQYKKOwcv6yXas0wB1HsDtqGMtsuYsalzE81R2zPAG06H_fY5Y4ReimwTFwFqk0r_rMylkseHXj6Rz0EhKSCjTY0aSZ1juO2gMK5tPW7VJOF-M0aaoMwxrN23oZx5xOGqaaFhJ8gXEcXVPREoVb6BkAYNYgXpGT22sd4ShwjmffWkqODkS7hd4nENI--iUzRnJngH_HZoBssF5tEUQ81ZfNQBh70rAGpMh07q1AT1CeXc3M3jI24xfzeFT58iRSlqLMqoRlAqUjcfbqmdbU53GwY08_txbGzCJu1gL9cG1oFGqt5S9g6GNPv-GZs6te_xLN2Y3kL9FB5Ltx88d7FAyOAwR4vludI0zo2LbvIx_Cpd0XnMkJX9VAKigAlKDHhGKIizCyxtzC8jr0D3AiVoEEhppGBsWkv7skhkSQ6YBSt63YUMbgNRjZqe6e7tCmTDB9PV99zfOk3A4S255GssXU6T4LApUdbQ0PHmR0epp1W-0v-hu7iOKkSOwEBY7n5jKSdBiBm38qbZVObS6vaLjnzHqLyQxAPQoIOSTCOZT1EWXIssw3GRmAKtsUpj9dbfdypaW4LajCmqd_YVcmcQox5XjIU_caDW4Nik-H0a9DQjjPw2ZJ8C43F-Mf_HYEvwmqq7Jmuql8xH1w7JuL33KtZnuuyBKWI51GnvbD2vjNZMeym4PMoc4eHQ8o7O0xbg0cPc_MSmowSwOYa4u3H1BFFoS1QYwEn8Czhx2zf4YzqObePPuGyaiCI5VSh9_Jjrb_91jgO_Fin9OLoQGcjlTahcwE47AW1UhTeXDMMAz4VEtR0MCbas-kH0WutjD9yuNHQz8E1VnAsyavyfX17ou_L_94JrEL3QXB3BSXM7juFAAZPMCRbQfg8aET-M-rjRl-QREhlFNgD24uAdm7Uh8RN',
    GROUP_ID: '33151600',
    PLACE_ID: '94262341273102',
    UNIVERSE_ID: '8955290738'
};

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages
    ]
});

// Initialize Database
const db = new Database('moderation.db');
db.exec(`
    CREATE TABLE IF NOT EXISTS whitelist (
        discord_id TEXT PRIMARY KEY,
        rank TEXT NOT NULL,
        added_by TEXT,
        added_at INTEGER
    );
    
    CREATE TABLE IF NOT EXISTS bans (
        roblox_id TEXT PRIMARY KEY,
        username TEXT,
        reason TEXT,
        proof TEXT,
        banned_by TEXT,
        banned_at INTEGER,
        expires_at INTEGER
    );
    
    CREATE TABLE IF NOT EXISTS warnings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        roblox_id TEXT,
        username TEXT,
        reason TEXT,
        proof TEXT,
        warned_by TEXT,
        warned_at INTEGER
    );
    
    CREATE TABLE IF NOT EXISTS punishment_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        roblox_id TEXT,
        username TEXT,
        action TEXT,
        reason TEXT,
        proof TEXT,
        moderator TEXT,
        timestamp INTEGER
    );
    
    CREATE TABLE IF NOT EXISTS strikes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        discord_id TEXT,
        reason TEXT,
        proof TEXT,
        issued_by TEXT,
        issued_at INTEGER
    );
    
    CREATE TABLE IF NOT EXISTS blacklisted_crews (
        group_id TEXT PRIMARY KEY,
        blacklisted_by TEXT,
        blacklisted_at INTEGER
    );
    
    CREATE TABLE IF NOT EXISTS config (
        key TEXT PRIMARY KEY,
        value TEXT
    );
`);

// Insert bot owner into whitelist
db.prepare('INSERT OR IGNORE INTO whitelist (discord_id, rank, added_by, added_at) VALUES (?, ?, ?, ?)').run(CONFIG.BOT_OWNER_ID, 'owner', 'SYSTEM', Date.now());

// Config helpers
function getConfig(key, defaultValue) {
    const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key);
    return row ? row.value : defaultValue;
}

function setConfig(key, value) {
    db.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)').run(key, value);
}

// Initialize config values
if (!getConfig('PLACE_ID')) setConfig('PLACE_ID', CONFIG.PLACE_ID);
if (!getConfig('UNIVERSE_ID')) setConfig('UNIVERSE_ID', CONFIG.UNIVERSE_ID);

// Permission System
const RANKS = {
    moderator: 1,
    admin: 2,
    manager: 3,
    owner: 4
};

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

// Roblox API Functions
async function getRobloxUserByUsername(username) {
    try {
        const response = await axios.post('https://users.roproxy.com/v1/usernames/users', {
            usernames: [username]
        });
        return response.data.data[0] || null;
    } catch (error) {
        console.error('Error fetching Roblox user:', error);
        return null;
    }
}

async function getRobloxUserById(userId) {
    try {
        const response = await axios.get(`https://users.roproxy.com/v1/users/${userId}`);
        return response.data;
    } catch (error) {
        console.error('Error fetching Roblox user by ID:', error);
        return null;
    }
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
        console.error('Error fetching Roblox user details:', error);
        return null;
    }
}

async function getGameStats() {
    try {
        const universeId = getConfig('UNIVERSE_ID', CONFIG.UNIVERSE_ID);
        const response = await axios.get(`https://games.roproxy.com/v1/games?universeIds=${universeId}`);
        const gameData = response.data.data[0];
        return {
            playing: gameData.playing,
            visits: gameData.visits
        };
    } catch (error) {
        console.error('Error fetching game stats:', error);
        return null;
    }
}

async function getGroupRoles(groupId) {
    try {
        const response = await axios.get(`https://groups.roproxy.com/v1/groups/${groupId}/roles`);
        return response.data.roles;
    } catch (error) {
        console.error('Error fetching group roles:', error);
        return null;
    }
}

async function setGroupRank(groupId, userId, roleId, cookie) {
    try {
        const response = await axios.patch(
            `https://groups.roblox.com/v1/groups/${groupId}/users/${userId}`,
            { roleId },
            { headers: { Cookie: `.ROBLOSECURITY=${cookie}` } }
        );
        return response.data;
    } catch (error) {
        console.error('Error setting group rank:', error);
        return null;
    }
}

async function getGroupInfo(groupId) {
    try {
        const response = await axios.get(`https://groups.roproxy.com/v1/groups/${groupId}`);
        return response.data;
    } catch (error) {
        console.error('Error fetching group info:', error);
        return null;
    }
}

// Modqueue Functions
async function sendToModqueue(action, data) {
    try {
        await axios.post(`${CONFIG.MODQUEUE_URL}/command`, {
            action,
            data,
            secret: CONFIG.SECRET_KEY
        });
        return true;
    } catch (error) {
        console.error('Error sending to modqueue:', error);
        return false;
    }
}

// Logging Functions
async function logToChannel(embed) {
    try {
        const channel = await client.channels.fetch(CONFIG.LOGS_CHANNEL_ID);
        await channel.send({ embeds: [embed] });
    } catch (error) {
        console.error('Error logging to channel:', error);
    }
}

async function logToDM(embed) {
    try {
        const owner = await client.users.fetch(CONFIG.BOT_OWNER_ID);
        await owner.send({ embeds: [embed] });
    } catch (error) {
        console.error('Error logging to DM:', error);
    }
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

// Confirmation System
async function createConfirmation(interaction, title, description, fields, thumbnailUrl) {
    const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor('#FFA500')
        .setTimestamp();
    
    if (fields) {
        embed.addFields(fields);
    }
    
    if (thumbnailUrl) {
        embed.setThumbnail(thumbnailUrl);
    }
    
    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('confirm')
                .setLabel('Confirm')
                .setStyle(ButtonStyle.Success)
                .setEmoji('✅'),
            new ButtonBuilder()
                .setCustomId('cancel')
                .setLabel('Cancel')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('❌')
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
                await i.update({ 
                    embeds: [new EmbedBuilder().setTitle('Action Cancelled').setColor('#FF0000')],
                    components: [] 
                });
                resolve(false);
            }
        });
        
        collector.on('end', collected => {
            if (collected.size === 0) {
                interaction.editReply({ 
                    embeds: [new EmbedBuilder().setTitle('Action Timed Out').setColor('#FF0000')],
                    components: [] 
                });
                resolve(false);
            }
        });
    });
}

// Commands
const commands = [
    new SlashCommandBuilder()
        .setName('whitelist')
        .setDescription('Add a user to the whitelist')
        .addUserOption(option => option.setName('user').setDescription('User to whitelist').setRequired(true))
        .addStringOption(option => option.setName('rank').setDescription('Rank to assign').setRequired(true)
            .addChoices(
                { name: 'Moderator', value: 'moderator' },
                { name: 'Admin', value: 'admin' },
                { name: 'Manager', value: 'manager' },
                { name: 'Owner', value: 'owner' }
            )),
    
    new SlashCommandBuilder()
        .setName('removewhitelist')
        .setDescription('Remove a user from the whitelist')
        .addUserOption(option => option.setName('user').setDescription('User to remove').setRequired(true)),
    
    new SlashCommandBuilder()
        .setName('whitelistedusers')
        .setDescription('View all whitelisted users'),
    
    new SlashCommandBuilder()
        .setName('kick')
        .setDescription('Kick a player from the game')
        .addStringOption(option => option.setName('player').setDescription('Username or UserID').setRequired(true))
        .addStringOption(option => option.setName('reason').setDescription('Reason for kick').setRequired(true))
        .addStringOption(option => option.setName('proof').setDescription('Proof/Evidence').setRequired(true)),
    
    new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Ban a player from the game')
        .addStringOption(option => option.setName('player').setDescription('Username or UserID').setRequired(true))
        .addStringOption(option => option.setName('reason').setDescription('Reason for ban').setRequired(true))
        .addStringOption(option => option.setName('proof').setDescription('Proof/Evidence').setRequired(true)),
    
    new SlashCommandBuilder()
        .setName('unban')
        .setDescription('Unban a player from the game')
        .addStringOption(option => option.setName('player').setDescription('Username or UserID').setRequired(true))
        .addStringOption(option => option.setName('reason').setDescription('Reason for unban').setRequired(true))
        .addStringOption(option => option.setName('proof').setDescription('Proof/Evidence').setRequired(true)),
    
    new SlashCommandBuilder()
        .setName('tempban')
        .setDescription('Temporarily ban a player')
        .addStringOption(option => option.setName('player').setDescription('Username or UserID').setRequired(true))
        .addStringOption(option => option.setName('duration').setDescription('Duration (e.g., 3d 2h 1m)').setRequired(true))
        .addStringOption(option => option.setName('reason').setDescription('Reason for tempban').setRequired(true))
        .addStringOption(option => option.setName('proof').setDescription('Proof/Evidence').setRequired(true)),
    
    new SlashCommandBuilder()
        .setName('checkban')
        .setDescription('Check if a player is banned')
        .addStringOption(option => option.setName('player').setDescription('Username or UserID').setRequired(true)),
    
    new SlashCommandBuilder()
        .setName('warn')
        .setDescription('Warn a player')
        .addStringOption(option => option.setName('player').setDescription('Username or UserID').setRequired(true))
        .addStringOption(option => option.setName('reason').setDescription('Reason for warning').setRequired(true))
        .addStringOption(option => option.setName('proof').setDescription('Proof/Evidence').setRequired(true)),
    
    new SlashCommandBuilder()
        .setName('checkwarn')
        .setDescription('Check warnings for a player')
        .addStringOption(option => option.setName('player').setDescription('Username or UserID').setRequired(true)),
    
    new SlashCommandBuilder()
        .setName('clearwarnings')
        .setDescription('Clear all warnings for a player')
        .addStringOption(option => option.setName('player').setDescription('Username or UserID').setRequired(true)),
    
    new SlashCommandBuilder()
        .setName('punishmenthistory')
        .setDescription('View punishment history for a player')
        .addStringOption(option => option.setName('player').setDescription('Username or UserID').setRequired(true)),
    
    new SlashCommandBuilder()
        .setName('bannedusers')
        .setDescription('Get a list of all banned users'),
    
    new SlashCommandBuilder()
        .setName('unbanwave')
        .setDescription('Unban all banned users'),
    
    new SlashCommandBuilder()
        .setName('restartallservers')
        .setDescription('Restart all game servers'),
    
    new SlashCommandBuilder()
        .setName('blacklistcrew')
        .setDescription('Blacklist a Roblox group')
        .addStringOption(option => option.setName('groupid').setDescription('Group ID to blacklist').setRequired(true)),
    
    new SlashCommandBuilder()
        .setName('removecrewblacklist')
        .setDescription('Remove a group from blacklist')
        .addStringOption(option => option.setName('groupid').setDescription('Group ID to remove').setRequired(true)),
    
    new SlashCommandBuilder()
        .setName('blacklistedcrews')
        .setDescription('View all blacklisted groups'),
    
    new SlashCommandBuilder()
        .setName('whois')
        .setDescription('Get detailed information about a Roblox user')
        .addStringOption(option => option.setName('player').setDescription('Username or UserID').setRequired(true)),
    
    new SlashCommandBuilder()
        .setName('check-ccu')
        .setDescription('Check current concurrent users'),
    
    new SlashCommandBuilder()
        .setName('viewlogs')
        .setDescription('View moderation logs for a staff member')
        .addUserOption(option => option.setName('user').setDescription('Staff member').setRequired(true)),
    
    new SlashCommandBuilder()
        .setName('announce')
        .setDescription('Send an announcement to all servers')
        .addStringOption(option => option.setName('message').setDescription('Message to announce').setRequired(true)),
    
    new SlashCommandBuilder()
        .setName('message')
        .setDescription('Send a message to a specific player')
        .addStringOption(option => option.setName('player').setDescription('Username or UserID').setRequired(true))
        .addStringOption(option => option.setName('message').setDescription('Message to send').setRequired(true)),
    
    new SlashCommandBuilder()
        .setName('mute')
        .setDescription('Mute a player in-game')
        .addStringOption(option => option.setName('player').setDescription('Username or UserID').setRequired(true))
        .addStringOption(option => option.setName('duration').setDescription('Duration (e.g., 1h 30m)').setRequired(true))
        .addStringOption(option => option.setName('reason').setDescription('Reason for mute').setRequired(true))
        .addStringOption(option => option.setName('proof').setDescription('Proof/Evidence').setRequired(true)),
    
    new SlashCommandBuilder()
        .setName('strike')
        .setDescription('Issue a strike to a staff member')
        .addUserOption(option => option.setName('user').setDescription('Staff member').setRequired(true))
        .addStringOption(option => option.setName('reason').setDescription('Reason for strike').setRequired(true))
        .addStringOption(option => option.setName('proof').setDescription('Proof/Evidence').setRequired(true)),
    
    new SlashCommandBuilder()
        .setName('grouprank')
        .setDescription('Change a player\'s group rank')
        .addStringOption(option => option.setName('player').setDescription('Username or UserID').setRequired(true)),
    
    new SlashCommandBuilder()
        .setName('addcash')
        .setDescription('Add cash to a player')
        .addStringOption(option => option.setName('player').setDescription('Username or UserID').setRequired(true))
        .addIntegerOption(option => option.setName('amount').setDescription('Amount to add').setRequired(true)),
    
    new SlashCommandBuilder()
        .setName('removecash')
        .setDescription('Remove cash from a player')
        .addStringOption(option => option.setName('player').setDescription('Username or UserID').setRequired(true))
        .addIntegerOption(option => option.setName('amount').setDescription('Amount to remove').setRequired(true)),
    
    new SlashCommandBuilder()
        .setName('setcash')
        .setDescription('Set a player\'s cash')
        .addStringOption(option => option.setName('player').setDescription('Username or UserID').setRequired(true))
        .addIntegerOption(option => option.setName('amount').setDescription('Amount to set').setRequired(true)),
    
    new SlashCommandBuilder()
        .setName('changeplaceid')
        .setDescription('Change the Place ID')
        .addStringOption(option => option.setName('placeid').setDescription('New Place ID').setRequired(true)),
    
    new SlashCommandBuilder()
        .setName('changeuniverseid')
        .setDescription('Change the Universe ID')
        .addStringOption(option => option.setName('universeid').setDescription('New Universe ID').setRequired(true))
];

// Register Commands
client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);
    
    // Register slash commands
    try {
        await client.application.commands.set(commands);
        console.log('Slash commands registered!');
    } catch (error) {
        console.error('Error registering commands:', error);
    }
    
    // Start update loops
    updateStatus();
    updateVoiceChannels();
    updateStatsChannel();
    
    setInterval(updateStatus, 10000);
    setInterval(updateVoiceChannels, 10000);
    setInterval(updateStatsChannel, 600000);
});

// Update Functions
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
    } catch (error) {
        console.error('Error updating voice channels:', error);
    }
}

async function updateStatsChannel() {
    try {
        const stats = await getGameStats();
        if (!stats) return;
        
        const milestone = Math.ceil(stats.visits / 10000) * 10000;
        
        const message = `-------------------------------------------------------
-------------------------------------------------------
‍🎮 Active players: ${stats.playing.toLocaleString()}
-------------------------------------------------------
-------------------------------------------------------
👥 Visits: ${stats.visits.toLocaleString()}
🎯 Next milestone: ${stats.visits.toLocaleString()}/${milestone.toLocaleString()}
-------------------------------------------------------
-------------------------------------------------------`;
        
        const channel = await client.channels.fetch(CONFIG.STATS_CHANNEL_ID);
        await channel.send(message);
    } catch (error) {
        console.error('Error updating stats channel:', error);
    }
}

// Parse duration
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

// Command Handler
client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;
    
    const { commandName } = interaction;
    
    // Permission checks
    const commandPermissions = {
        whitelist: 'owner',
        removewhitelist: 'owner',
        whitelistedusers: 'owner',
        unbanwave: 'owner',
        restartallservers: 'owner',
        blacklistcrew: 'owner',
        removecrewblacklist: 'owner',
        blacklistedcrews: 'owner',
        grouprank: 'owner',
        changeplaceid: 'owner',
        changeuniverseid: 'owner',
        clearwarnings: 'manager',
        bannedusers: 'manager',
        viewlogs: 'manager',
        announce: 'manager',
        strike: 'manager',
        setcash: 'manager',
        punishmenthistory: 'admin',
        message: 'admin',
        addcash: 'admin',
        removecash: 'admin',
        kick: 'moderator',
        ban: 'moderator',
        unban: 'moderator',
        tempban: 'moderator',
        checkban: 'moderator',
        warn: 'moderator',
        checkwarn: 'moderator',
        mute: 'moderator',
        whois: 'moderator',
        'check-ccu': 'moderator'
    };
    
    const requiredRank = commandPermissions[commandName];
    if (requiredRank && !hasPermission(interaction.user.id, requiredRank)) {
        return interaction.reply({ content: '❌ You do not have permission to use this command.', ephemeral: true });
    }
    
    try {
        // Whitelist commands
        if (commandName === 'whitelist') {
            const user = interaction.options.getUser('user');
            const rank = interaction.options.getString('rank');
            
            db.prepare('INSERT OR REPLACE INTO whitelist (discord_id, rank, added_by, added_at) VALUES (?, ?, ?, ?)').run(user.id, rank, interaction.user.id, Date.now());
            
            await logCommand(interaction, 'Whitelist', {
                'User': `<@${user.id}>`,
                'Rank': rank
            });
            
            return interaction.reply({ content: `✅ Successfully whitelisted ${user.tag} as **${rank}**`, ephemeral: true });
        }
        
        if (commandName === 'removewhitelist') {
            const user = interaction.options.getUser('user');
            
            db.prepare('DELETE FROM whitelist WHERE discord_id = ?').run(user.id);
            
            await logCommand(interaction, 'Remove Whitelist', {
                'User': `<@${user.id}>`
            });
            
            return interaction.reply({ content: `✅ Successfully removed ${user.tag} from whitelist`, ephemeral: true });
        }
        
        if (commandName === 'whitelistedusers') {
            const users = db.prepare('SELECT * FROM whitelist').all();
            
            if (users.length === 0) {
                return interaction.reply({ content: '❌ No whitelisted users found.', ephemeral: true });
            }
            
            const embed = new EmbedBuilder()
                .setTitle('Whitelisted Users')
                .setColor('#00FF00')
                .setTimestamp();
            
            for (const user of users) {
                embed.addFields({ 
                    name: `<@${user.discord_id}>`, 
                    value: `**Rank:** ${user.rank}\n**Added:** <t:${Math.floor(user.added_at / 1000)}:R>` 
                });
            }
            
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }
        
        // Moderation commands
        if (commandName === 'kick') {
            const playerInput = interaction.options.getString('player');
            const reason = interaction.options.getString('reason');
            const proof = interaction.options.getString('proof');
            
            const user = isNaN(playerInput) ? await getRobloxUserByUsername(playerInput) : await getRobloxUserById(playerInput);
            
            if (!user) {
                return interaction.reply({ content: '❌ Could not find that Roblox user.', ephemeral: true });
            }
            
            const confirmed = await createConfirmation(
                interaction,
                'Confirm Kick',
                `Are you sure you want to kick this player?`,
                [
                    { name: 'Username', value: user.name || user.displayName },
                    { name: 'User ID', value: String(user.id) },
                    { name: 'Reason', value: reason },
                    { name: 'Proof', value: proof }
                ],
                `https://www.roblox.com/headshot-thumbnail/image?userId=${user.id}&width=150&height=150&format=png`
            );
            
            if (!confirmed) return;
            
            await sendToModqueue('kick', { userId: user.id, reason });
            
            db.prepare('INSERT INTO punishment_history (roblox_id, username, action, reason, proof, moderator, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
                user.id, user.name || user.displayName, 'Kick', reason, proof, interaction.user.id, Date.now()
            );
            
            await logCommand(interaction, 'Kick', {
                'Player': `${user.name || user.displayName} (${user.id})`,
                'Reason': reason,
                'Proof': proof
            });
            
            return interaction.editReply({ content: `✅ Successfully kicked **${user.name || user.displayName}**`, embeds: [], components: [] });
        }
        
        if (commandName === 'ban') {
            const playerInput = interaction.options.getString('player');
            const reason = interaction.options.getString('reason');
            const proof = interaction.options.getString('proof');
            
            const user = isNaN(playerInput) ? await getRobloxUserByUsername(playerInput) : await getRobloxUserById(playerInput);
            
            if (!user) {
                return interaction.reply({ content: '❌ Could not find that Roblox user.', ephemeral: true });
            }
            
            const confirmed = await createConfirmation(
                interaction,
                'Confirm Ban',
                `Are you sure you want to ban this player?`,
                [
                    { name: 'Username', value: user.name || user.displayName },
                    { name: 'User ID', value: String(user.id) },
                    { name: 'Reason', value: reason },
                    { name: 'Proof', value: proof }
                ],
                `https://www.roblox.com/headshot-thumbnail/image?userId=${user.id}&width=150&height=150&format=png`
            );
            
            if (!confirmed) return;
            
            db.prepare('INSERT OR REPLACE INTO bans (roblox_id, username, reason, proof, banned_by, banned_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
                user.id, user.name || user.displayName, reason, proof, interaction.user.id, Date.now(), null
            );
            
            await sendToModqueue('ban', { userId: user.id, reason });
            
            db.prepare('INSERT INTO punishment_history (roblox_id, username, action, reason, proof, moderator, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
                user.id, user.name || user.displayName, 'Ban', reason, proof, interaction.user.id, Date.now()
            );
            
            await logCommand(interaction, 'Ban', {
                'Player': `${user.name || user.displayName} (${user.id})`,
                'Reason': reason,
                'Proof': proof
            });
            
            return interaction.editReply({ content: `✅ Successfully banned **${user.name || user.displayName}**`, embeds: [], components: [] });
        }
        
        if (commandName === 'unban') {
            const playerInput = interaction.options.getString('player');
            const reason = interaction.options.getString('reason');
            const proof = interaction.options.getString('proof');
            
            const user = isNaN(playerInput) ? await getRobloxUserByUsername(playerInput) : await getRobloxUserById(playerInput);
            
            if (!user) {
                return interaction.reply({ content: '❌ Could not find that Roblox user.', ephemeral: true });
            }
            
            const confirmed = await createConfirmation(
                interaction,
                'Confirm Unban',
                `Are you sure you want to unban this player?`,
                [
                    { name: 'Username', value: user.name || user.displayName },
                    { name: 'User ID', value: String(user.id) },
                    { name: 'Reason', value: reason },
                    { name: 'Proof', value: proof }
                ],
                `https://www.roblox.com/headshot-thumbnail/image?userId=${user.id}&width=150&height=150&format=png`
            );
            
            if (!confirmed) return;
            
            db.prepare('DELETE FROM bans WHERE roblox_id = ?').run(user.id);
            
            await sendToModqueue('unban', { userId: user.id });
            
            db.prepare('INSERT INTO punishment_history (roblox_id, username, action, reason, proof, moderator, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
                user.id, user.name || user.displayName, 'Unban', reason, proof, interaction.user.id, Date.now()
            );
            
            await logCommand(interaction, 'Unban', {
                'Player': `${user.name || user.displayName} (${user.id})`,
                'Reason': reason,
                'Proof': proof
            });
            
            return interaction.editReply({ content: `✅ Successfully unbanned **${user.name || user.displayName}**`, embeds: [], components: [] });
        }
        
        if (commandName === 'tempban') {
            const playerInput = interaction.options.getString('player');
            const duration = interaction.options.getString('duration');
            const reason = interaction.options.getString('reason');
            const proof = interaction.options.getString('proof');
            
            const user = isNaN(playerInput) ? await getRobloxUserByUsername(playerInput) : await getRobloxUserById(playerInput);
            
            if (!user) {
                return interaction.reply({ content: '❌ Could not find that Roblox user.', ephemeral: true });
            }
            
            const durationMs = parseDuration(duration);
            const expiresAt = Date.now() + durationMs;
            
            const confirmed = await createConfirmation(
                interaction,
                'Confirm Temporary Ban',
                `Are you sure you want to temporarily ban this player?`,
                [
                    { name: 'Username', value: user.name || user.displayName },
                    { name: 'User ID', value: String(user.id) },
                    { name: 'Duration', value: duration },
                    { name: 'Expires', value: `<t:${Math.floor(expiresAt / 1000)}:F>` },
                    { name: 'Reason', value: reason },
                    { name: 'Proof', value: proof }
                ],
                `https://www.roblox.com/headshot-thumbnail/image?userId=${user.id}&width=150&height=150&format=png`
            );
            
            if (!confirmed) return;
            
            db.prepare('INSERT OR REPLACE INTO bans (roblox_id, username, reason, proof, banned_by, banned_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
                user.id, user.name || user.displayName, reason, proof, interaction.user.id, Date.now(), expiresAt
            );
            
            await sendToModqueue('ban', { userId: user.id, reason, expiresAt });
            
            db.prepare('INSERT INTO punishment_history (roblox_id, username, action, reason, proof, moderator, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
                user.id, user.name || user.displayName, `Tempban (${duration})`, reason, proof, interaction.user.id, Date.now()
            );
            
            await logCommand(interaction, 'Tempban', {
                'Player': `${user.name || user.displayName} (${user.id})`,
                'Duration': duration,
                'Expires': `<t:${Math.floor(expiresAt / 1000)}:F>`,
                'Reason': reason,
                'Proof': proof
            });
            
            return interaction.editReply({ content: `✅ Successfully temp-banned **${user.name || user.displayName}** for ${duration}`, embeds: [], components: [] });
        }
        
        if (commandName === 'checkban') {
            const playerInput = interaction.options.getString('player');
            
            const user = isNaN(playerInput) ? await getRobloxUserByUsername(playerInput) : await getRobloxUserById(playerInput);
            
            if (!user) {
                return interaction.reply({ content: '❌ Could not find that Roblox user.', ephemeral: true });
            }
            
            const ban = db.prepare('SELECT * FROM bans WHERE roblox_id = ?').get(user.id);
            
            if (!ban) {
                return interaction.reply({ content: `✅ **${user.name || user.displayName}** is not banned.`, ephemeral: true });
            }
            
            const embed = new EmbedBuilder()
                .setTitle('Ban Information')
                .setColor('#FF0000')
                .setThumbnail(`https://www.roblox.com/headshot-thumbnail/image?userId=${user.id}&width=150&height=150&format=png`)
                .addFields(
                    { name: 'Username', value: ban.username },
                    { name: 'User ID', value: ban.roblox_id },
                    { name: 'Reason', value: ban.reason },
                    { name: 'Proof', value: ban.proof },
                    { name: 'Banned By', value: `<@${ban.banned_by}>` },
                    { name: 'Banned At', value: `<t:${Math.floor(ban.banned_at / 1000)}:F>` }
                );
            
            if (ban.expires_at) {
                embed.addFields({ name: 'Expires At', value: `<t:${Math.floor(ban.expires_at / 1000)}:F>` });
            } else {
                embed.addFields({ name: 'Type', value: 'Permanent' });
            }
            
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }
        
        if (commandName === 'warn') {
            const playerInput = interaction.options.getString('player');
            const reason = interaction.options.getString('reason');
            const proof = interaction.options.getString('proof');
            
            const user = isNaN(playerInput) ? await getRobloxUserByUsername(playerInput) : await getRobloxUserById(playerInput);
            
            if (!user) {
                return interaction.reply({ content: '❌ Could not find that Roblox user.', ephemeral: true });
            }
            
            const confirmed = await createConfirmation(
                interaction,
                'Confirm Warning',
                `Are you sure you want to warn this player?`,
                [
                    { name: 'Username', value: user.name || user.displayName },
                    { name: 'User ID', value: String(user.id) },
                    { name: 'Reason', value: reason },
                    { name: 'Proof', value: proof }
                ],
                `https://www.roblox.com/headshot-thumbnail/image?userId=${user.id}&width=150&height=150&format=png`
            );
            
            if (!confirmed) return;
            
            db.prepare('INSERT INTO warnings (roblox_id, username, reason, proof, warned_by, warned_at) VALUES (?, ?, ?, ?, ?, ?)').run(
                user.id, user.name || user.displayName, reason, proof, interaction.user.id, Date.now()
            );
            
            await sendToModqueue('warn', { userId: user.id, reason });
            
            const warningCount = db.prepare('SELECT COUNT(*) as count FROM warnings WHERE roblox_id = ?').get(user.id).count;
            
            db.prepare('INSERT INTO punishment_history (roblox_id, username, action, reason, proof, moderator, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
                user.id, user.name || user.displayName, 'Warn', reason, proof, interaction.user.id, Date.now()
            );
            
            await logCommand(interaction, 'Warn', {
                'Player': `${user.name || user.displayName} (${user.id})`,
                'Reason': reason,
                'Proof': proof,
                'Total Warnings': String(warningCount)
            });
            
            let message = `✅ Successfully warned **${user.name || user.displayName}** (Warning #${warningCount})`;
            
            if (warningCount >= 3) {
                const expiresAt = Date.now() + (3 * 24 * 60 * 60 * 1000);
                db.prepare('INSERT OR REPLACE INTO bans (roblox_id, username, reason, proof, banned_by, banned_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
                    user.id, user.name || user.displayName, '3 Warnings Auto-Ban', 'Automated', 'SYSTEM', Date.now(), expiresAt
                );
                await sendToModqueue('ban', { userId: user.id, reason: '3 Warnings', expiresAt });
                message += '\n⚠️ **Player has been automatically banned for 3 days due to 3 warnings!**';
            }
            
            return interaction.editReply({ content: message, embeds: [], components: [] });
        }
        
        if (commandName === 'checkwarn') {
            const playerInput = interaction.options.getString('player');
            
            const user = isNaN(playerInput) ? await getRobloxUserByUsername(playerInput) : await getRobloxUserById(playerInput);
            
            if (!user) {
                return interaction.reply({ content: '❌ Could not find that Roblox user.', ephemeral: true });
            }
            
            const warnings = db.prepare('SELECT * FROM warnings WHERE roblox_id = ? ORDER BY warned_at DESC').all(user.id);
            
            if (warnings.length === 0) {
                return interaction.reply({ content: `✅ **${user.name || user.displayName}** has no warnings.`, ephemeral: true });
            }
            
            const embed = new EmbedBuilder()
                .setTitle(`Warnings for ${user.name || user.displayName}`)
                .setColor('#FFA500')
                .setThumbnail(`https://www.roblox.com/headshot-thumbnail/image?userId=${user.id}&width=150&height=150&format=png`)
                .setDescription(`Total Warnings: **${warnings.length}**`);
            
            for (const warning of warnings.slice(0, 10)) {
                embed.addFields({
                    name: `Warning #${warnings.indexOf(warning) + 1}`,
                    value: `**Reason:** ${warning.reason}\n**Proof:** ${warning.proof}\n**By:** <@${warning.warned_by}>\n**Date:** <t:${Math.floor(warning.warned_at / 1000)}:R>`
                });
            }
            
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }
        
        if (commandName === 'clearwarnings') {
            const playerInput = interaction.options.getString('player');
            
            const user = isNaN(playerInput) ? await getRobloxUserByUsername(playerInput) : await getRobloxUserById(playerInput);
            
            if (!user) {
                return interaction.reply({ content: '❌ Could not find that Roblox user.', ephemeral: true });
            }
            
            const confirmed = await createConfirmation(
                interaction,
                'Confirm Clear Warnings',
                `Are you sure you want to clear all warnings for this player?`,
                [
                    { name: 'Username', value: user.name || user.displayName },
                    { name: 'User ID', value: String(user.id) }
                ],
                `https://www.roblox.com/headshot-thumbnail/image?userId=${user.id}&width=150&height=150&format=png`
            );
            
            if (!confirmed) return;
            
            db.prepare('DELETE FROM warnings WHERE roblox_id = ?').run(user.id);
            
            await logCommand(interaction, 'Clear Warnings', {
                'Player': `${user.name || user.displayName} (${user.id})`
            });
            
            return interaction.editReply({ content: `✅ Successfully cleared all warnings for **${user.name || user.displayName}**`, embeds: [], components: [] });
        }
        
        if (commandName === 'punishmenthistory') {
            const playerInput = interaction.options.getString('player');
            
            const user = isNaN(playerInput) ? await getRobloxUserByUsername(playerInput) : await getRobloxUserById(playerInput);
            
            if (!user) {
                return interaction.reply({ content: '❌ Could not find that Roblox user.', ephemeral: true });
            }
            
            const history = db.prepare('SELECT * FROM punishment_history WHERE roblox_id = ? ORDER BY timestamp DESC').all(user.id);
            
            if (history.length === 0) {
                return interaction.reply({ content: `✅ **${user.name || user.displayName}** has no punishment history.`, ephemeral: true });
            }
            
            const embed = new EmbedBuilder()
                .setTitle(`Punishment History for ${user.name || user.displayName}`)
                .setColor('#FF0000')
                .setThumbnail(`https://www.roblox.com/headshot-thumbnail/image?userId=${user.id}&width=150&height=150&format=png`)
                .setDescription(`Total Punishments: **${history.length}**`);
            
            for (const record of history.slice(0, 10)) {
                embed.addFields({
                    name: `${record.action}`,
                    value: `**Reason:** ${record.reason}\n**Proof:** ${record.proof}\n**By:** <@${record.moderator}>\n**Date:** <t:${Math.floor(record.timestamp / 1000)}:R>`
                });
            }
            
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }
        
        if (commandName === 'bannedusers') {
            const confirmed = await createConfirmation(
                interaction,
                'Confirm Export',
                `Are you sure you want to export all banned users?`,
                null,
                null
            );
            
            if (!confirmed) return;
            
            const bans = db.prepare('SELECT * FROM bans').all();
            
            if (bans.length === 0) {
                return interaction.editReply({ content: '✅ No banned users found.', embeds: [], components: [] });
            }
            
            let fileContent = 'Username,UserID,Reason,BannedBy,BannedAt,ExpiresAt\n';
            for (const ban of bans) {
                fileContent += `${ban.username},${ban.roblox_id},${ban.reason},${ban.banned_by},${new Date(ban.banned_at).toISOString()},${ban.expires_at ? new Date(ban.expires_at).toISOString() : 'Permanent'}\n`;
            }
            
            const buffer = Buffer.from(fileContent, 'utf-8');
            
            await logCommand(interaction, 'Export Banned Users', {
                'Total Bans': String(bans.length)
            });
            
            return interaction.editReply({ 
                content: `✅ Exported ${bans.length} banned users`,
                files: [{ attachment: buffer, name: 'banned_users.txt' }],
                embeds: [],
                components: []
            });
        }
        
        if (commandName === 'unbanwave') {
            const confirmed = await createConfirmation(
                interaction,
                'Confirm Unban Wave',
                `⚠️ **WARNING:** Are you sure you want to unban ALL banned users? This action cannot be undone!`,
                null,
                null
            );
            
            if (!confirmed) return;
            
            const bans = db.prepare('SELECT * FROM bans').all();
            db.prepare('DELETE FROM bans').run();
            
            await sendToModqueue('unbanwave', {});
            
            await logCommand(interaction, 'Unban Wave', {
                'Users Unbanned': String(bans.length)
            });
            
            return interaction.editReply({ content: `✅ Successfully unbanned **${bans.length}** users`, embeds: [], components: [] });
        }
        
        if (commandName === 'restartallservers') {
            const confirmed = await createConfirmation(
                interaction,
                'Confirm Server Restart',
                `⚠️ **WARNING:** Are you sure you want to restart all servers?`,
                null,
                null
            );
            
            if (!confirmed) return;
            
            await sendToModqueue('restartallservers', {});
            
            await logCommand(interaction, 'Restart All Servers', {});
            
            return interaction.editReply({ content: `✅ Restarting all servers...`, embeds: [], components: [] });
        }
        
        if (commandName === 'blacklistcrew') {
            const groupId = interaction.options.getString('groupid');
            
            const groupInfo = await getGroupInfo(groupId);
            
            if (!groupInfo) {
                return interaction.reply({ content: '❌ Could not find that Roblox group.', ephemeral: true });
            }
            
            const confirmed = await createConfirmation(
                interaction,
                'Confirm Crew Blacklist',
                `Are you sure you want to blacklist this group?`,
                [
                    { name: 'Group Name', value: groupInfo.name },
                    { name: 'Group ID', value: groupId },
                    { name: 'Members', value: String(groupInfo.memberCount) },
                    { name: 'Link', value: `https://www.roblox.com/groups/${groupId}` }
                ],
                `https://thumbnails.roproxy.com/v1/groups/icons?groupIds=${groupId}&size=150x150&format=Png`
            );
            
            if (!confirmed) return;
            
            db.prepare('INSERT OR REPLACE INTO blacklisted_crews (group_id, blacklisted_by, blacklisted_at) VALUES (?, ?, ?)').run(
                groupId, interaction.user.id, Date.now()
            );
            
            await sendToModqueue('blacklistcrew', { groupId });
            
            await logCommand(interaction, 'Blacklist Crew', {
                'Group Name': groupInfo.name,
                'Group ID': groupId,
                'Members': String(groupInfo.memberCount)
            });
            
            return interaction.editReply({ content: `✅ Successfully blacklisted **${groupInfo.name}**`, embeds: [], components: [] });
        }
        
        if (commandName === 'removecrewblacklist') {
            const groupId = interaction.options.getString('groupid');
            
            const groupInfo = await getGroupInfo(groupId);
            
            if (!groupInfo) {
                return interaction.reply({ content: '❌ Could not find that Roblox group.', ephemeral: true });
            }
            
            const confirmed = await createConfirmation(
                interaction,
                'Confirm Remove Blacklist',
                `Are you sure you want to remove this group from the blacklist?`,
                [
                    { name: 'Group Name', value: groupInfo.name },
                    { name: 'Group ID', value: groupId }
                ],
                `https://thumbnails.roproxy.com/v1/groups/icons?groupIds=${groupId}&size=150x150&format=Png`
            );
            
            if (!confirmed) return;
            
            db.prepare('DELETE FROM blacklisted_crews WHERE group_id = ?').run(groupId);
            
            await sendToModqueue('removecrewblacklist', { groupId });
            
            await logCommand(interaction, 'Remove Crew Blacklist', {
                'Group Name': groupInfo.name,
                'Group ID': groupId
            });
            
            return interaction.editReply({ content: `✅ Successfully removed **${groupInfo.name}** from blacklist`, embeds: [], components: [] });
        }
        
        if (commandName === 'blacklistedcrews') {
            const crews = db.prepare('SELECT * FROM blacklisted_crews').all();
            
            if (crews.length === 0) {
                return interaction.reply({ content: '✅ No blacklisted crews found.', ephemeral: true });
            }
            
            const embed = new EmbedBuilder()
                .setTitle('Blacklisted Crews')
                .setColor('#FF0000')
                .setTimestamp();
            
            for (const crew of crews) {
                const groupInfo = await getGroupInfo(crew.group_id);
                embed.addFields({
                    name: groupInfo ? groupInfo.name : `Group ${crew.group_id}`,
                    value: `**ID:** ${crew.group_id}\n**Blacklisted:** <t:${Math.floor(crew.blacklisted_at / 1000)}:R>`
                });
            }
            
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }
        
        if (commandName === 'whois') {
            const playerInput = interaction.options.getString('player');
            
            const user = isNaN(playerInput) ? await getRobloxUserByUsername(playerInput) : await getRobloxUserById(playerInput);
            
            if (!user) {
                return interaction.reply({ content: '❌ Could not find that Roblox user.', ephemeral: true });
            }
            
            const details = await getRobloxUserDetails(user.id);
            
            if (!details) {
                return interaction.reply({ content: '❌ Could not fetch user details.', ephemeral: true });
            }
            
            const embed = new EmbedBuilder()
                .setTitle(`${details.displayName} (@${details.name})`)
                .setColor('#00FF00')
                .setThumbnail(`https://www.roblox.com/headshot-thumbnail/image?userId=${details.id}&width=150&height=150&format=png`)
                .addFields(
                    { name: 'User ID', value: String(details.id), inline: true },
                    { name: 'Display Name', value: details.displayName, inline: true },
                    { name: 'Username', value: details.name, inline: true },
                    { name: 'Description', value: details.description || 'No description', inline: false },
                    { name: 'Friends', value: String(details.friendCount), inline: true },
                    { name: 'Followers', value: String(details.followerCount), inline: true },
                    { name: 'Following', value: String(details.followingCount), inline: true },
                    { name: 'Created', value: `<t:${Math.floor(new Date(details.created).getTime() / 1000)}:F>`, inline: false },
                    { name: 'Profile', value: `https://www.roblox.com/users/${details.id}/profile`, inline: false }
                )
                .setTimestamp();
            
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }
        
        if (commandName === 'check-ccu') {
            const stats = await getGameStats();
            
            if (!stats) {
                return interaction.reply({ content: '❌ Could not fetch game stats.', ephemeral: true });
            }
            
            return interaction.reply({ content: `🎮 **${stats.playing}** players are currently playing Deh Hood`, ephemeral: true });
        }
        
        if (commandName === 'viewlogs') {
            const user = interaction.options.getUser('user');
            
            const whitelisted = db.prepare('SELECT * FROM whitelist WHERE discord_id = ?').get(user.id);
            
            if (!whitelisted) {
                return interaction.reply({ content: '❌ This member is not a staff member.', ephemeral: true });
            }
            
            const logs = db.prepare('SELECT * FROM punishment_history WHERE moderator = ? ORDER BY timestamp DESC LIMIT 25').all(user.id);
            
            if (logs.length === 0) {
                return interaction.reply({ content: `✅ **${user.tag}** has no moderation logs.`, ephemeral: true });
            }
            
            const embed = new EmbedBuilder()
                .setTitle(`Moderation Logs for ${user.tag}`)
                .setColor('#0099FF')
                .setDescription(`Total Actions: **${logs.length}**`);
            
            for (const log of logs.slice(0, 10)) {
                embed.addFields({
                    name: log.action,
                    value: `**Player:** ${log.username}\n**Reason:** ${log.reason}\n**Date:** <t:${Math.floor(log.timestamp / 1000)}:R>`
                });
            }
            
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }
        
        if (commandName === 'announce') {
            const message = interaction.options.getString('message');
            
            const confirmed = await createConfirmation(
                interaction,
                'Confirm Announcement',
                `Are you sure you want to send this announcement to all servers?`,
                [{ name: 'Message', value: message }],
                null
            );
            
            if (!confirmed) return;
            
            await sendToModqueue('announce', { message });
            
            await logCommand(interaction, 'Announce', {
                'Message': message
            });
            
            return interaction.editReply({ content: `✅ Announcement sent to all servers`, embeds: [], components: [] });
        }
        
        if (commandName === 'message') {
            const playerInput = interaction.options.getString('player');
            const message = interaction.options.getString('message');
            
            const user = isNaN(playerInput) ? await getRobloxUserByUsername(playerInput) : await getRobloxUserById(playerInput);
            
            if (!user) {
                return interaction.reply({ content: '❌ Could not find that Roblox user.', ephemeral: true });
            }
            
            const confirmed = await createConfirmation(
                interaction,
                'Confirm Message',
                `Are you sure you want to send this message to this player?`,
                [
                    { name: 'Username', value: user.name || user.displayName },
                    { name: 'User ID', value: String(user.id) },
                    { name: 'Message', value: message }
                ],
                `https://www.roblox.com/headshot-thumbnail/image?userId=${user.id}&width=150&height=150&format=png`
            );
            
            if (!confirmed) return;
            
            await sendToModqueue('message', { userId: user.id, message });
            
            await logCommand(interaction, 'Message Player', {
                'Player': `${user.name || user.displayName} (${user.id})`,
                'Message': message
            });
            
            return interaction.editReply({ content: `✅ Message sent to **${user.name || user.displayName}**`, embeds: [], components: [] });
        }
        
        if (commandName === 'mute') {
            const playerInput = interaction.options.getString('player');
            const duration = interaction.options.getString('duration');
            const reason = interaction.options.getString('reason');
            const proof = interaction.options.getString('proof');
            
            const user = isNaN(playerInput) ? await getRobloxUserByUsername(playerInput) : await getRobloxUserById(playerInput);
            
            if (!user) {
                return interaction.reply({ content: '❌ Could not find that Roblox user.', ephemeral: true });
            }
            
            const durationMs = parseDuration(duration);
            const expiresAt = Date.now() + durationMs;
            
            const confirmed = await createConfirmation(
                interaction,
                'Confirm Mute',
                `Are you sure you want to mute this player?`,
                [
                    { name: 'Username', value: user.name || user.displayName },
                    { name: 'User ID', value: String(user.id) },
                    { name: 'Duration', value: duration },
                    { name: 'Expires', value: `<t:${Math.floor(expiresAt / 1000)}:F>` },
                    { name: 'Reason', value: reason },
                    { name: 'Proof', value: proof }
                ],
                `https://www.roblox.com/headshot-thumbnail/image?userId=${user.id}&width=150&height=150&format=png`
            );
            
            if (!confirmed) return;
            
            await sendToModqueue('mute', { userId: user.id, duration: durationMs, reason });
            
            db.prepare('INSERT INTO punishment_history (roblox_id, username, action, reason, proof, moderator, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
                user.id, user.name || user.displayName, `Mute (${duration})`, reason, proof, interaction.user.id, Date.now()
            );
            
            await logCommand(interaction, 'Mute', {
                'Player': `${user.name || user.displayName} (${user.id})`,
                'Duration': duration,
                'Expires': `<t:${Math.floor(expiresAt / 1000)}:F>`,
                'Reason': reason,
                'Proof': proof
            });
            
            return interaction.editReply({ content: `✅ Successfully muted **${user.name || user.displayName}** for ${duration}`, embeds: [], components: [] });
        }
        
        if (commandName === 'strike') {
            const user = interaction.options.getUser('user');
            const reason = interaction.options.getString('reason');
            const proof = interaction.options.getString('proof');
            
            const whitelisted = db.prepare('SELECT * FROM whitelist WHERE discord_id = ?').get(user.id);
            
            if (!whitelisted) {
                return interaction.reply({ content: '❌ This member is not a staff member.', ephemeral: true });
            }
            
            const confirmed = await createConfirmation(
                interaction,
                'Confirm Strike',
                `Are you sure you want to strike this staff member?`,
                [
                    { name: 'Staff Member', value: `<@${user.id}>` },
                    { name: 'Current Rank', value: whitelisted.rank },
                    { name: 'Reason', value: reason },
                    { name: 'Proof', value: proof }
                ],
                null
            );
            
            if (!confirmed) return;
            
            db.prepare('INSERT INTO strikes (discord_id, reason, proof, issued_by, issued_at) VALUES (?, ?, ?, ?, ?)').run(
                user.id, reason, proof, interaction.user.id, Date.now()
            );
            
            const strikeCount = db.prepare('SELECT COUNT(*) as count FROM strikes WHERE discord_id = ?').get(user.id).count;
            
            await logCommand(interaction, 'Strike', {
                'Staff Member': `<@${user.id}>`,
                'Rank': whitelisted.rank,
                'Reason': reason,
                'Proof': proof,
                'Total Strikes': String(strikeCount)
            });
            
            let message = `✅ Successfully issued strike to **${user.tag}** (Strike #${strikeCount})`;
            
            if (strikeCount >= 3) {
                db.prepare('DELETE FROM whitelist WHERE discord_id = ?').run(user.id);
                
                const removalEmbed = new EmbedBuilder()
                    .setTitle('Staff Member Removed')
                    .setColor('#FF0000')
                    .addFields(
                        { name: 'Staff Member', value: `<@${user.id}>` },
                        { name: 'Reason', value: '3 Strikes - Automatic Removal' },
                        { name: 'Total Strikes', value: String(strikeCount) }
                    )
                    .setTimestamp();
                
                await logToChannel(removalEmbed);
                await logToDM(removalEmbed);
                
                message += '\n⚠️ **Staff member has been automatically removed from whitelist due to 3 strikes!**';
            }
            
            return interaction.editReply({ content: message, embeds: [], components: [] });
        }
        
        if (commandName === 'grouprank') {
            const playerInput = interaction.options.getString('player');
            
            const user = isNaN(playerInput) ? await getRobloxUserByUsername(playerInput) : await getRobloxUserById(playerInput);
            
            if (!user) {
                return interaction.reply({ content: '❌ Could not find that Roblox user.', ephemeral: true });
            }
            
            const roles = await getGroupRoles(CONFIG.GROUP_ID);
            
            if (!roles) {
                return interaction.reply({ content: '❌ Could not fetch group roles.', ephemeral: true });
            }
            
            const embed = new EmbedBuilder()
                .setTitle(`Select Rank for ${user.name || user.displayName}`)
                .setColor('#00FF00')
                .setThumbnail(`https://www.roblox.com/headshot-thumbnail/image?userId=${user.id}&width=150&height=150&format=png`)
                .setDescription('Select a role from the dropdown below:');
            
            const options = roles.map(role => ({
                label: role.name,
                description: `Rank: ${role.rank}`,
                value: String(role.id)
            }));
            
            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('rank_select')
                .setPlaceholder('Select a rank')
                .addOptions(options.slice(0, 25));
            
            const row = new ActionRowBuilder().addComponents(selectMenu);
            
            const message = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });
            
            const filter = i => i.user.id === interaction.user.id;
            const collector = message.createMessageComponentCollector({ filter, time: 60000, max: 1 });
            
            collector.on('collect', async i => {
                const roleId = parseInt(i.values[0]);
                const selectedRole = roles.find(r => r.id === roleId);
                
                const result = await setGroupRank(CONFIG.GROUP_ID, user.id, roleId, CONFIG.ROBLOX_COOKIE);
                
                if (result) {
                    await logCommand(interaction, 'Group Rank', {
                        'Player': `${user.name || user.displayName} (${user.id})`,
                        'New Rank': selectedRole.name
                    });
                    
                    await i.update({ 
                        content: `✅ Successfully ranked **${user.name || user.displayName}** to **${selectedRole.name}**`,
                        embeds: [],
                        components: [] 
                    });
                } else {
                    await i.update({ 
                        content: `❌ Failed to rank user. Make sure the bot account has permission.`,
                        embeds: [],
                        components: [] 
                    });
                }
            });
        }
        
        if (commandName === 'addcash') {
            const playerInput = interaction.options.getString('player');
            const amount = interaction.options.getInteger('amount');
            
            const user = isNaN(playerInput) ? await getRobloxUserByUsername(playerInput) : await getRobloxUserById(playerInput);
            
            if (!user) {
                return interaction.reply({ content: '❌ Could not find that Roblox user.', ephemeral: true });
            }
            
            const confirmed = await createConfirmation(
                interaction,
                'Confirm Add Cash',
                `Are you sure you want to add cash to this player?`,
                [
                    { name: 'Username', value: user.name || user.displayName },
                    { name: 'User ID', value: String(user.id) },
                    { name: 'Amount', value: String(amount) }
                ],
                `https://www.roblox.com/headshot-thumbnail/image?userId=${user.id}&width=150&height=150&format=png`
            );
            
            if (!confirmed) return;
            
            await sendToModqueue('addcash', { userId: user.id, amount });
            
            await logCommand(interaction, 'Add Cash', {
                'Player': `${user.name || user.displayName} (${user.id})`,
                'Amount': String(amount)
            });
            
            return interaction.editReply({ content: `✅ Successfully added **${amount}** cash to **${user.name || user.displayName}**`, embeds: [], components: [] });
        }
        
        if (commandName === 'removecash') {
            const playerInput = interaction.options.getString('player');
            const amount = interaction.options.getInteger('amount');
            
            const user = isNaN(playerInput) ? await getRobloxUserByUsername(playerInput) : await getRobloxUserById(playerInput);
            
            if (!user) {
                return interaction.reply({ content: '❌ Could not find that Roblox user.', ephemeral: true });
            }
            
            const confirmed = await createConfirmation(
                interaction,
                'Confirm Remove Cash',
                `Are you sure you want to remove cash from this player?`,
                [
                    { name: 'Username', value: user.name || user.displayName },
                    { name: 'User ID', value: String(user.id) },
                    { name: 'Amount', value: String(amount) }
                ],
                `https://www.roblox.com/headshot-thumbnail/image?userId=${user.id}&width=150&height=150&format=png`
            );
            
            if (!confirmed) return;
            
            await sendToModqueue('removecash', { userId: user.id, amount });
            
            await logCommand(interaction, 'Remove Cash', {
                'Player': `${user.name || user.displayName} (${user.id})`,
                'Amount': String(amount)
            });
            
            return interaction.editReply({ content: `✅ Successfully removed **${amount}** cash from **${user.name || user.displayName}**`, embeds: [], components: [] });
        }
        
        if (commandName === 'setcash') {
            const playerInput = interaction.options.getString('player');
            const amount = interaction.options.getInteger('amount');
            
            const user = isNaN(playerInput) ? await getRobloxUserByUsername(playerInput) : await getRobloxUserById(playerInput);
            
            if (!user) {
                return interaction.reply({ content: '❌ Could not find that Roblox user.', ephemeral: true });
            }
            
            const confirmed = await createConfirmation(
                interaction,
                'Confirm Set Cash',
                `Are you sure you want to set this player's cash?`,
                [
                    { name: 'Username', value: user.name || user.displayName },
                    { name: 'User ID', value: String(user.id) },
                    { name: 'Amount', value: String(amount) }
                ],
                `https://www.roblox.com/headshot-thumbnail/image?userId=${user.id}&width=150&height=150&format=png`
            );
            
            if (!confirmed) return;
            
            await sendToModqueue('setcash', { userId: user.id, amount });
            
            await logCommand(interaction, 'Set Cash', {
                'Player': `${user.name || user.displayName} (${user.id})`,
                'Amount': String(amount)
            });
            
            return interaction.editReply({ content: `✅ Successfully set **${user.name || user.displayName}**'s cash to **${amount}**`, embeds: [], components: [] });
        }
        
        if (commandName === 'changeplaceid') {
            const placeId = interaction.options.getString('placeid');
            
            const confirmed = await createConfirmation(
                interaction,
                'Confirm Change Place ID',
                `Are you sure you want to change the Place ID?`,
                [
                    { name: 'New Place ID', value: placeId }
                ],
                null
            );
            
            if (!confirmed) return;
            
            setConfig('PLACE_ID', placeId);
            
            await logCommand(interaction, 'Change Place ID', {
                'New Place ID': placeId
            });
            
            return interaction.editReply({ content: `✅ Successfully changed Place ID to **${placeId}**`, embeds: [], components: [] });
        }
        
        if (commandName === 'changeuniverseid') {
            const universeId = interaction.options.getString('universeid');
            
            const confirmed = await createConfirmation(
                interaction,
                'Confirm Change Universe ID',
                `Are you sure you want to change the Universe ID?`,
                [
                    { name: 'New Universe ID', value: universeId }
                ],
                null
            );
            
            if (!confirmed) return;
            
            setConfig('UNIVERSE_ID', universeId);
            
            await logCommand(interaction, 'Change Universe ID', {
                'New Universe ID': universeId
            });
            
            return interaction.editReply({ content: `✅ Successfully changed Universe ID to **${universeId}**`, embeds: [], components: [] });
        }
        
    } catch (error) {
        console.error(`Error executing command ${commandName}:`, error);
        const errorMessage = { content: '❌ An error occurred while executing this command.', ephemeral: true };
        if (interaction.replied || interaction.deferred) {
            await interaction.editReply(errorMessage);
        } else {
            await interaction.reply(errorMessage);
        }
    }
});

// Auto-unban expired tempbans
setInterval(() => {
    const now = Date.now();
    const expiredBans = db.prepare('SELECT * FROM bans WHERE expires_at IS NOT NULL AND expires_at <= ?').all(now);
    
    for (const ban of expiredBans) {
        db.prepare('DELETE FROM bans WHERE roblox_id = ?').run(ban.roblox_id);
        sendToModqueue('unban', { userId: ban.roblox_id });
        console.log(`Auto-unbanned ${ban.username} (expired tempban)`);
    }
}, 60000);

client.login(CONFIG.BOT_TOKEN); 

