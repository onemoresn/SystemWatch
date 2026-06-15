const { app, BrowserWindow, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const { spawn } = require('child_process')
const http = require('http')

const PORT = 3847
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

function waitForHealth(timeoutMs = 60000) {
  const start = Date.now()
  return new Promise((resolve, reject) => {
    const tick = () => {
      http
        .get(`http://127.0.0.1:${PORT}/health`, (res) => {
          if (res.statusCode === 200) resolve()
          else retry()
        })
        .on('error', retry)
    }
    const retry = () => {
      if (Date.now() - start > timeoutMs) reject(new Error('API failed to start'))
      else setTimeout(tick, 400)
    }
    tick()
  })
}

function startApi() {
  const root = resourcesRoot()
  const apiEntry = path.join(root, 'api', 'dist', 'index.js')
  const node = nodeExecutable()
  const userData = app.getPath('userData')

  if (!fs.existsSync(apiEntry)) {
    throw new Error(`API not found at ${apiEntry}`)
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
    },
    windowsHide: true,
  })

  apiProcess.stdout?.on('data', (d) => console.log('[api]', d.toString().trim()))
  apiProcess.stderr?.on('data', (d) => console.error('[api]', d.toString().trim()))
  apiProcess.on('error', (err) => {
    console.error('Failed to spawn API:', err)
    dialog.showErrorBox(
      'SiteCommand',
      'Could not start the local API. Install Node.js 20+ or reinstall SiteCommand.',
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
    webPreferences: { contextIsolation: true },
  })
  mainWindow.loadURL(`http://127.0.0.1:${PORT}/`)
}

app.whenReady().then(async () => {
  try {
    startApi()
    await waitForHealth()
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
