const { app, BrowserWindow, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const { spawn } = require('child_process')
const http = require('http')

const PORT = 39547
let apiProcess = null
let mainWindow = null

function resourcesRoot() {
  if (!app.isPackaged) {
    return path.join(__dirname, '..', 'dist-bundle', 'sitecommand')
  }
  return path.join(process.resourcesPath, 'sitecommand')
}

function nodeExecutable() {
  if (!app.isPackaged) return 'node'
  const bundled = path.join(process.resourcesPath, 'node', 'node.exe')
  if (fs.existsSync(bundled)) return bundled
  return 'node'
}

function httpGet(url, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let body = ''
      res.on('data', (chunk) => { body += chunk })
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }))
    })
    req.on('error', reject)
    req.setTimeout(timeoutMs, () => {
      req.destroy()
      reject(new Error(`Timeout loading ${url}`))
    })
  })
}

async function waitForReady(timeoutMs = 90000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const health = await httpGet(`http://127.0.0.1:${PORT}/health`)
      if (health.status !== 200) throw new Error('health not ok')

      const page = await httpGet(`http://127.0.0.1:${PORT}/`)
      if (page.status !== 200 || !page.body.includes('id="root"')) {
        throw new Error('dashboard HTML missing')
      }
      return
    } catch {
      await new Promise((r) => setTimeout(r, 500))
    }
  }
  throw new Error('SiteCommand failed to start. Try reinstalling or restart your PC.')
}

function startApi() {
  const root = resourcesRoot()
  const apiEntry = path.join(root, 'api', 'dist', 'index.js')
  const webDist = path.join(root, 'web', 'dist')
  const node = nodeExecutable()
  const userData = app.getPath('userData')

  if (!fs.existsSync(apiEntry)) {
    throw new Error(`API not found at ${apiEntry}`)
  }
  if (!fs.existsSync(path.join(webDist, 'index.html'))) {
    throw new Error(`Dashboard not found at ${webDist}`)
  }

  apiProcess = spawn(node, [apiEntry], {
    cwd: path.join(root, 'api'),
    env: {
      ...process.env,
      SITECOMMAND_ROOT: root,
      DATABASE_PATH: path.join(userData, 'sitecommand.db'),
      PORT: String(PORT),
      HOST: '127.0.0.1',
      NODE_ENV: 'production',
      CLOUD_API_URL: process.env.CLOUD_API_URL || 'https://systemwatch.onrender.com',
    },
    windowsHide: true,
  })

  apiProcess.on('exit', (code, signal) => {
    if (code !== 0 && code !== null) {
      console.error('[api] exited', code, signal)
      if (mainWindow) {
        dialog.showErrorBox('SiteCommand', `Background service stopped (code ${code}).`)
      }
    }
  })

  apiProcess.stdout?.on('data', (d) => console.log('[api]', d.toString().trim()))
  apiProcess.stderr?.on('data', (d) => console.error('[api]', d.toString().trim()))
  apiProcess.on('error', (err) => {
    console.error('Failed to spawn API:', err)
    dialog.showErrorBox(
      'SiteCommand',
      'Could not start the local service. Reinstall SiteCommand or install Node.js 20+.',
    )
  })
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    title: 'SiteCommand',
    autoHideMenuBar: true,
    backgroundColor: '#f5f7fa',
    webPreferences: { contextIsolation: true },
  })

  mainWindow.webContents.on('did-fail-load', (_event, code, description, url) => {
    dialog.showErrorBox(
      'SiteCommand',
      `Failed to load dashboard (${code}): ${description}\n${url}`,
    )
  })

  mainWindow.loadURL(`http://127.0.0.1:${PORT}/`)
}

app.whenReady().then(async () => {
  try {
    startApi()
    await waitForReady()
    createWindow()
  } catch (err) {
    dialog.showErrorBox('SiteCommand', String(err?.message ?? err))
    app.quit()
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  if (apiProcess) apiProcess.kill()
})
