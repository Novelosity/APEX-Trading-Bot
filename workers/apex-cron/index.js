const https = require('https')
const http = require('http')

const VERCEL_URL = process.env.VERCEL_URL || 'https://apex-web-kohl.vercel.app'
const CRON_SECRET = process.env.CRON_SECRET || ''
const PORT = process.env.PORT || 8080

function callCron(path) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, VERCEL_URL)
    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'GET',
      headers: {
        Authorization: `Bearer ${CRON_SECRET}`,
      },
    }
    const req = https.request(options, (res) => {
      let body = ''
      res.on('data', (chunk) => (body += chunk))
      res.on('end', () => {
        console.log(`[${new Date().toISOString()}] ${path} → ${res.statusCode} ${body.slice(0, 200)}`)
        resolve({ status: res.statusCode, body })
      })
    })
    req.on('error', (err) => {
      console.error(`[${new Date().toISOString()}] ${path} ERROR:`, err.message)
      reject(err)
    })
    req.end()
  })
}

// Track last run times
let lastScan = 0
let lastExecute = 0
let lastMonitor = 0

async function tick() {
  const now = Date.now()

  // Scan every 15 minutes (generates signals)
  if (now - lastScan >= 15 * 60 * 1000) {
    lastScan = now
    callCron('/api/cron/scan').catch(() => {})
  }

  // Execute every 5 minutes (processes auto trades)
  if (now - lastExecute >= 5 * 60 * 1000) {
    lastExecute = now
    callCron('/api/cron/execute').catch(() => {} )
  }

  // Monitor every 5 minutes
  if (now - lastMonitor >= 5 * 60 * 1000) {
    lastMonitor = now
    callCron('/api/cron/monitor').catch(() => {} )
  }
}

// Run tick every minute to check schedules
setInterval(tick, 60 * 1000)

// Run immediately on start
tick()

// Minimal HTTP server so Fly.io health checks pass
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({
    ok: true,
    lastScan: new Date(lastScan).toISOString(),
    lastExecute: new Date(lastExecute).toISOString(),
    lastMonitor: new Date(lastMonitor).toISOString(),
  }))
})
server.listen(PORT, () => {
  console.log(`[${new Date().toISOString()}] apex-cron running on port ${PORT}`)
  console.log(`VERCEL_URL: ${VERCEL_URL}`)
  console.log(`CRON_SECRET set: ${!!CRON_SECRET}`)
})
