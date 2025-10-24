/**
 * Alert Script for MCPHub Cloudflare Integration
 * 
 * This script sends alerts when issues are detected with the MCPHub service
 * or Cloudflare Tunnel. It can be configured to send alerts via email,
 * Slack, or other notification channels.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

// Load environment variables
require('dotenv').config();

// Configuration
const config = {
  alertLogFile: '/var/log/mcphub-alerts.log',
  slackWebhookUrl: process.env.SLACK_WEBHOOK_URL,
  discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL,
  emailTo: process.env.ALERT_EMAIL,
  emailFrom: process.env.ALERT_EMAIL_FROM || 'mcphub-alerts@example.com',
};

/**
 * Send alert to Slack
 * @param {string} message - Alert message
 */
function sendSlackAlert(message) {
  if (!config.slackWebhookUrl) return;
  
  const payload = JSON.stringify({
    text: `🚨 MCPHub Alert: ${message}`,
  });
  
  const options = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': payload.length,
    },
  };
  
  const req = https.request(config.slackWebhookUrl, options);
  req.write(payload);
  req.end();
}

/**
 * Send alert to Discord
 * @param {string} message - Alert message
 */
function sendDiscordAlert(message) {
  if (!config.discordWebhookUrl) return;
  
  const payload = JSON.stringify({
    content: `🚨 **MCPHub Alert**: ${message}`,
  });
  
  const options = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': payload.length,
    },
  };
  
  const req = https.request(config.discordWebhookUrl, options);
  req.write(payload);
  req.end();
}

/**
 * Process alerts from the log file
 */
function processAlerts() {
  try {
    // Check if alert log file exists
    if (!fs.existsSync(config.alertLogFile)) {
      console.log(`Alert log file not found: ${config.alertLogFile}`);
      return;
    }
    
    // Read the alert log file
    const alertLog = fs.readFileSync(config.alertLogFile, 'utf8');
    const alertLines = alertLog.split('\n').filter(line => line.trim() !== '');
    
    // Process only new alerts (last 5 lines)
    const newAlerts = alertLines.slice(-5);
    
    // Send alerts
    for (const alert of newAlerts) {
      // Extract the alert message
      const match = alert.match(/ALERT: (.*)/);
      if (match && match[1]) {
        const alertMessage = match[1];
        
        // Send alerts to configured channels
        sendSlackAlert(alertMessage);
        sendDiscordAlert(alertMessage);
        
        console.log(`Sent alert: ${alertMessage}`);
      }
    }
  } catch (error) {
    console.error('Error processing alerts:', error);
  }
}

// Process alerts when script is run
processAlerts();

