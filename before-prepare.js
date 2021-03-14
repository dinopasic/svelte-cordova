const os = require('os');
const ipLogic = require('./services/ip-logic.js')
const cordovaConfigPath = 'config.xml'

if (!process.env.CORDOVA_PLATFORM) {
  console.log('process.env.CORDOVA_PLATFORM not defined. Not running before-prepare.js hook.')
  return;
}

const fs = require('fs-extra')
const production = process.env.CORDOVA_PROD;
const platform = process.env.CORDOVA_PLATFORM;
let networkInterfaces = os.networkInterfaces()

function info(msg) {
  console.log(msg)
}

function updateConfigUrl(cordovaConfigPath, url) {
  fs.copyFileSync(cordovaConfigPath, `${cordovaConfigPath}.backup`)
  info(`updating ${cordovaConfigPath} content to ${url}`)

  let cordovaConfig = fs.readFileSync(cordovaConfigPath, 'utf-8')
  const lines = cordovaConfig.split(/\r?\n/g).reverse()

  const contentIndex = lines.findIndex(line => line.match(/\s*<content/))
  let allowNavigationIndex = lines.findIndex(line => line.match(/\s*<allow-navigation/))
  if (contentIndex >= 0) {
    lines[contentIndex] = `    <content src="${url}" />`
  }

  let allowNavigation = `    <allow-navigation href="${url}" />`
  if (allowNavigationIndex >= 0) {
    if (production) {
      lines.splice(allowNavigationIndex, 1)
    } else {
      lines[allowNavigationIndex] = allowNavigation
    }
  } else {
    if (!production) {
      lines.splice(contentIndex, 0, allowNavigation)
    }
  }
  cordovaConfig = lines.reverse().join('\n')
  fs.writeFileSync(cordovaConfigPath, cordovaConfig)
}

function readConfigValue(cordovaConfigPath, key) {
  let cordovaConfig = fs.readFileSync(cordovaConfigPath, 'utf-8')
  const lines = cordovaConfig.split(/\r?\n/g).reverse()

  const configValueExtractor = extractText(['value="','"/>']);
  let keyValueLineIndex = lines.findIndex(line => line.includes('<preference name="' + key))

  if (keyValueLineIndex >= 0) {
    return configValueExtractor(lines[keyValueLineIndex])
  }
  return ''
}

function extractText([beg, end]) {
  const matcher = new RegExp(`${beg}(.*?)${end}`,'gm');
  const normalise = (str) => str.slice(beg.length,end.length*-1);
  return function(str) {
      return str.match(matcher).map(normalise);
  }
}

function generateIndexHtml(ctx) {
  let htmlContent = fs.readFileSync(`${publicFolder}/index.html`, 'utf-8')
  const lines = htmlContent.split(/\r?\n/g).reverse()

  const bodyIndex = lines.findIndex(line => line.match(/\s*<\/body/))
  let cordovaJsScript = '    <script src="cordova.js"></script>'
  if (!production) {
    let isBrowser = ctx.opts.platforms.includes('browser')
    let isIos = ctx.opts.platforms.includes('ios')
    if(!isBrowser) {
      const cordovaJsLocation = isIos ? 'bundle' : 'assets';
      cordovaJsScript = `    <script src="cdvfile://localhost/${cordovaJsLocation}/www/cordova.js"></script>`
    }
  }

  if (bodyIndex >= 0) {
    lines.splice(bodyIndex + 1, 0, cordovaJsScript)
  } else {
    console.error(`couldn't find </body> tag in ${publicFolder}/index.html`)
  }
  htmlContent = lines.reverse().join('\n')
  fs.writeFileSync('www/index.html', htmlContent)
}

function clearWWW() {

  fs.readdirSync('www').forEach(file => {
    if (file == 'README.md') return;
    if (svelteFiles.includes(file)) return;

    console.log(`removing ${file}`)
    fs.removeSync(`www/${file}`)
  })
}

function copyPublicFiles() {

  fs.readdirSync(publicFolder).forEach(file => {
    if (svelteFiles.includes(file)) return;

    console.log(`copying ${file} to src-cordova/www folder`)
    fs.copySync(`${publicFolder}/${file}`, `www/${file}`)
  });
}

const publicFolder = '../public'
let debugNetworkMac = readConfigValue(cordovaConfigPath, 'DeviceDebuggingNetworkMacAddress')

const ip = process.env.SERVER_IP ? process.env.SERVER_IP : ipLogic.getIP(networkInterfaces, debugNetworkMac)
const url = (production || platform == 'browser') ? 'index.html' : `http://${ip}:5000`
let svelteFiles = [
  'index.html',
  'bundle.js',
  'bundle.js.map',
  'bundle.css',
  'bundle.css.map'
]

function runHook(ctx) {
  if (!url || !cordovaConfigPath) {
    console.error(`url or config path don't exist`)
    return
  }

  updateConfigUrl(cordovaConfigPath, url)

  clearWWW()
  copyPublicFiles()
  generateIndexHtml(ctx)
}

module.exports = runHook
