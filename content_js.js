// Content script - runs on axiom.trade pages
class AxiomDevSniper {
    constructor() {
        this.wallet = null;
        this.isActive = false;
        this.settings = {
            sellThreshold: 10,
            buyAmount: 0.1,
            slippage: 10
        };
        this.monitoredPairs = new Map();
        this.solanaConnection = null;
        
        this.initialize();
    }

    async initialize() {
        console.log('Axiom Dev Sniper initialized');
        
        // Listen for messages from popup
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            this.handleMessage(request, sender, sendResponse);
            return true; // Indicates we will send a response asynchronously
        });

        // Initialize Solana connection
        await this.initializeSolana();
        
        // Start observing the page for new pairs
        this.observeNewPairs();
        
        // Inject wallet connection script
        this.injectWalletScript();
    }

    async initializeSolana() {
        try {
            // Use public RPC endpoint - in production you'd want a dedicated RPC
            const RPC_ENDPOINT = 'https://api.mainnet-beta.solana.com';
            // Note: In actual implementation, you'd import @solana/web3.js
            // For now, we'll use the injected script approach
        } catch (error) {
            console.error('Failed to initialize Solana connection:', error);
        }
    }

    injectWalletScript() {
        // Inject script to access window.solana (Phantom wallet)
        const script = document.createElement('script');
        script.src = chrome.runtime.getURL('injected.js');
        (document.head || document.documentElement).appendChild(script);
        
        // Listen for messages from injected script
        window.addEventListener('message', (event) => {
            if (event.source !== window || !event.data.type) return;
            
            if (event.data.type === 'WALLET_RESPONSE') {
                this.handleWalletResponse(event.data);
            }
        });
    }

    async handleMessage(request, sender, sendResponse) {
        try {
            switch (request.action) {
                case 'connectWallet':
                    const connectResult = await this.connectWallet();
                    sendResponse(connectResult);
                    break;
                    
                case 'disconnectWallet':
                    await this.disconnectWallet();
                    sendResponse({ success: true });
                    break;
                    
                case 'checkConnection':
                    const connectionStatus = await this.checkWalletConnection();
                    sendResponse(connectionStatus);
                    break;
                    
                case 'startSniper':
                    this.settings = request.settings;
                    const startResult = await this.startSniper();
                    sendResponse(startResult);
                    break;
                    
                case 'stopSniper':
                    await this.stopSniper();
                    sendResponse({ success: true });
                    break;
                    
                default:
                    sendResponse({ success: false, error: 'Unknown action' });
            }
        } catch (error) {
            console.error('Error handling message:', error);
            sendResponse({ success: false, error: error.message });
        }
    }

    async connectWallet() {
        return new Promise((resolve) => {
            // Send message to injected script to connect wallet
            window.postMessage({
                type: 'CONNECT_WALLET',
                id: Date.now()
            }, '*');
            
            // Set up response handler
            this.walletResponseHandler = (data) => {
                if (data.action === 'connect') {
                    if (data.success) {
                        this.wallet = {
                            address: data.address,
                            publicKey: data.publicKey
                        };
                        resolve({
                            success: true,
                            address: data.address,
                            balance: data.balance
                        });
                    } else {
                        resolve({
                            success: false,
                            error: data.error
                        });
                    }
                }
            };
        });
    }

    async disconnectWallet() {
        this.wallet = null;
        window.postMessage({
            type: 'DISCONNECT_WALLET'
        }, '*');
    }

    async checkWalletConnection() {
        if (!this.wallet) {
            return { connected: false };
        }
        
        // Check if wallet is still connected
        return new Promise((resolve) => {
            window.postMessage({
                type: 'CHECK_CONNECTION'
            }, '*');
            
            this.walletResponseHandler = (data) => {
                if (data.action === 'check') {
                    resolve({
                        connected: data.connected,
                        address: data.address,
                        balance: data.balance
                    });
                }
            };
        });
    }

    handleWalletResponse(data) {
        if (this.walletResponseHandler) {
            this.walletResponseHandler(data);
            this.walletResponseHandler = null;
        }
    }

    async startSniper() {
        if (!this.wallet) {
            return { success: false, error: 'Wallet not connected' };
        }
        
        this.isActive = true;
        console.log('Dev sniper started with settings:', this.settings);
        
        // Add visual indicator that sniper is active
        this.addSniperUI();
        
        return { success: true };
    }

    async stopSniper() {
        this.isActive = false;
        this.monitoredPairs.clear();
        console.log('Dev sniper stopped');
        
        // Remove visual indicator
        this.removeSniperUI();
    }

    observeNewPairs() {
        // Observe changes in the page to detect new trading pairs
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            this.checkForNewPairs(node);
                        }
                    });
                }
            });
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    checkForNewPairs(element) {
        // Look for elements that might represent new trading pairs
        // This needs to be customized based on Axiom's actual DOM structure
        
        if (!this.isActive) return;
        
        // Example: Look for elements with specific classes or attributes
        const pairElements = element.querySelectorAll('[data-pair], .trading-pair, .token-pair');
        
        pairElements.forEach((pairElement) => {
            this.processPairElement(pairElement);
        });
    }

    processPairElement(pairElement) {
        try {
            // Extract pair information from the element
            const pairInfo = this.extractPairInfo(pairElement);
            
            if (pairInfo && !this.monitoredPairs.has(pairInfo.address)) {
                console.log('New pair detected:', pairInfo);
                
                // Add dev snipe button if this element looks like it has a red button
                this.addDevSnipeButton(pairElement, pairInfo);
                
                // Start monitoring this pair
                this.monitoredPairs.set(pairInfo.address, pairInfo);
            }
        } catch (error) {
            console.error('Error processing pair element:', error);
        }
    }

    extractPairInfo(element) {
        // This needs to be customized based on Axiom's DOM structure
        // For now, we'll return mock data
        
        // Look for token information in the element
        const tokenSymbol = element.querySelector('.token-symbol')?.textContent;
        const tokenAddress = element.getAttribute('data-token-address');
        
        if (!tokenSymbol || !tokenAddress) {
            return null;
        }
        
        return {
            symbol: tokenSymbol,
            address: tokenAddress,
            devWallet: null, // Will be determined by checking the mint authority
            element: element
        };
    }

    addDevSnipeButton(pairElement, pairInfo) {
        // Find existing buttons in the pair element
        const buttonContainer = pairElement.querySelector('.button-container, .actions, .controls');
        
        if (!buttonContainer) return;
        
        // Create dev snipe button
        const devSnipeBtn = document.createElement('button');
        devSnipeBtn.className = 'dev-snipe-btn';
        devSnipeBtn.innerHTML = '🎯';
        devSnipeBtn.title = 'Dev Snipe - Auto buy when dev sells';
        devSnipeBtn.style.cssText = `
            background: #ef4444;
            color: white;
            border: none;
            border-radius: 4px;
            padding: 8px 12px;
            cursor: pointer;
            font-size: 14px;
            margin-left: 5px;
            transition: background 0.2s;
        `;
        
        devSnipeBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.activateDevSnipe(pairInfo);
        });
        
        devSnipeBtn.addEventListener('mouseenter', () => {
            devSnipeBtn.style.background = '#dc2626';
        });
        
        devSnipeBtn.addEventListener('mouseleave', () => {
            devSnipeBtn.style.background = '#ef4444';
        });
        
        buttonContainer.appendChild(devSnipeBtn);
    }

    async activateDevSnipe(pairInfo) {
        if (!this.wallet) {
            alert('Please connect your wallet first');
            return;
        }
        
        console.log('Activating dev snipe for:', pairInfo);
        
        try {
            // First, identify the dev wallet (mint authority)
            const devWallet = await this.getDevWallet(pairInfo.address);
            
            if (!devWallet) {
                alert('Could not identify dev wallet for this token');
                return;
            }
            
            pairInfo.devWallet = devWallet;
            
            // Start monitoring the dev wallet
            this.monitorDevWallet(pairInfo);
            
            // Update UI to show active monitoring
            this.updatePairUI(pairInfo, 'monitoring');
            
        } catch (error) {
            console.error('Error activating dev snipe:', error);
            alert('Error activating dev snipe: ' + error.message);
        }
    }

    async getDevWallet(tokenAddress) {
        // In a real implementation, this would query the Solana blockchain
        // to get the mint authority of the token
        
        return new Promise((resolve) => {
            window.postMessage({
                type: 'GET_DEV_WALLET',
                tokenAddress: tokenAddress
            }, '*');
            
            this.walletResponseHandler = (data) => {
                if (data.action === 'getDevWallet') {
                    resolve(data.devWallet);
                }
            };
        });
    }

    monitorDevWallet(pairInfo) {
        // This would set up real-time monitoring of the dev wallet
        // In production, you'd use WebSocket connections to Solana RPC
        
        console.log(`Monitoring dev wallet ${pairInfo.devWallet} for token ${pairInfo.symbol}`);
        
        // For demo purposes, we'll simulate monitoring
        pairInfo.monitoring = true;
        
        // In real implementation:
        // - Subscribe to account changes for the dev wallet
        // - Calculate percentage of holdings sold
        // - Execute buy order when threshold is met
    }

    updatePairUI(pairInfo, status) {
        const btn = pairInfo.element.querySelector('.dev-snipe-btn');
        if (!btn) return;
        
        switch (status) {
            case 'monitoring':
                btn.style.background = '#10b981';
                btn.innerHTML = '👁️';
                btn.title = 'Monitoring dev wallet...';
                break;
            case 'triggered':
                btn.style.background = '#f59e0b';
                btn.innerHTML = '⚡';
                btn.title = 'Buy order executed!';
                break;
        }
    }

    addSniperUI() {
        // Add a visual indicator that the sniper is active
        if (document.getElementById('sniper-indicator')) return;
        
        const indicator = document.createElement('div');
        indicator.id = 'sniper-indicator';
        indicator.innerHTML = '🎯 Dev Sniper Active';
        indicator.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            background: #10b981;
            color: white;
            padding: 8px 12px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: bold;
            z-index: 10000;
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        `;
        
        document.body.appendChild(indicator);
    }

    removeSniperUI() {
        const indicator = document.getElementById('sniper-indicator');
        if (indicator) {
            indicator.remove();
        }
    }
}

// Initialize the dev sniper when the page loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        new AxiomDevSniper();
    });
} else {
    new AxiomDevSniper();
}