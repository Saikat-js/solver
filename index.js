
const { Client } = require('discord.js-selfbot-v13');
const https = require('https');
const http = require('http');
const fs = require('fs');

// Load configuration
const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));

// Load tokens
function loadTokens() {
  const tokens = new Map();
  try {
    const data = fs.readFileSync('tokens.txt', 'utf8');
    const lines = data.split('\n').filter(line => line.trim());
    
    for (const line of lines) {
      const [userId, token] = line.trim().split(' ');
      if (userId && token) {
        tokens.set(userId, token);
      }
    }
  } catch (error) {
    console.error('Error loading tokens.txt:', error.message);
  }
  return tokens;
}

// CAPTCHA solving function
function solveCaptcha(apiKey, userId, token, hostname) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      userId: userId,
      token: token
    });

    // Parse hostname and port
    let host = hostname;
    let port = 443; // default HTTPS port
    let useHttps = true;
    
    if (hostname.includes(':')) {
      const parts = hostname.split(':');
      host = parts[0];
      port = parseInt(parts[1]);
      // Use HTTP for custom ports (like 3000), HTTPS for default 443
      useHttps = (port === 443);
    }

    const options = {
      hostname: host,
      port: port,
      path: '/solve',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length,
        'x-api-key': apiKey
      }
    };

    const req = (useHttps ? https : http).request(options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        try {
          const jsonResponse = JSON.parse(responseData);
          if (jsonResponse.result) {
            resolve({ success: true, result: jsonResponse.result });
          } else {
            resolve({ success: false, error: 'Captcha solving failed' });
          }
        } catch (error) {
          reject(new Error(`Error parsing response: ${error.message}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error(`Request error: ${error.message}`));
    });

    req.write(data);
    req.end();
  });
}

// Function to handle CAPTCHA messages
async function handleCaptchaMessage(message, tokens) {
  // Check if message is from Poketwo bot
  if (message.author.id !== '716390085896962058') return;
  
  // Check if message contains CAPTCHA
  const captchaRegex = /Whoa there\. Please tell us you're human! https:\/\/verify\.poketwo\.net\/captcha\/(\d+)/;
  const match = message.content.match(captchaRegex);
  
  if (match) {
    const userId = match[1];
    console.log(`CAPTCHA detected for user ID: ${userId}`);
    
    const userToken = tokens.get(userId);
    
    if (!userToken) {
      console.log(`No token found for user ID: ${userId}`);
      return;
    }
    
    try {
      console.log(`Attempting to solve CAPTCHA for user ${userId}...`);
      
      const response = await solveCaptcha(
        config.apiKey,
        userId,
        userToken,
        config.hostname
      );
      
      if (response.success) {
        console.log(`✅ CAPTCHA solved successfully for user ${userId}`);
        console.log(`Result: ${response.result}`);
      } else {
        console.log(`❌ CAPTCHA solving failed for user ${userId}: ${response.error}`);
      }
    } catch (error) {
      console.error(`Error solving CAPTCHA for user ${userId}:`, error.message);
    }
  }
}

// Load tokens and create clients
const tokens = loadTokens();
const clients = [];

if (tokens.size === 0) {
  console.error('No tokens found in tokens.txt. Please add tokens in the format: USERID TOKEN');
  process.exit(1);
}

console.log(`Loaded ${tokens.size} tokens from tokens.txt`);

// Create a client for each token
for (const [userId, token] of tokens) {
  const client = new Client();
  
  client.once('ready', () => {
    console.log(`✅ Client for user ${userId} (${client.user.tag}) is ready!`);
  });

  client.on('messageCreate', async (message) => {
    await handleCaptchaMessage(message, tokens);
  });

  client.on('error', (error) => {
    console.error(`❌ Error with client for user ${userId}:`, error.message);
  });

  // Login with the token
  client.login(token).catch((error) => {
    console.error(`❌ Failed to login with token for user ${userId}:`, error.message);
  });

  clients.push(client);
}

console.log('All selfbot clients are starting up and will monitor for CAPTCHA messages...');
