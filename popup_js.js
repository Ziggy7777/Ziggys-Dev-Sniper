// Popup script for the Chrome extension
class DevSniperPopup {
    constructor() {
        this.isConnected = false;
        this.walletAddress = null;
        this.isActive = false;
        
        this.initializeElements();
        this.attachEventListeners();
        this.loadSavedSettings();
        this.checkWalletConnection();
    }

    initializeElements() {
        this.elements = {
            walletStatus: document.getElementById('wallet-status'),
            connectBtn: document.getElementById('connect-wallet'),
            disconnectBtn: document.getElementById('disconnect-wallet'),
            walletInfo: document.getElementById('wallet-info'),
            walletAddress: document.getElementById('wallet-address'),
            walletBalance: document.getElementById('wallet-balance'),
            sellThreshold: document.getElementById('sell-threshold'),
            buyAmount: document.getElementById('buy-amount'),
            slippage: document.getElementById('slippage'),
            toggleBtn: document.getElementById('toggle-sniper')
        };
    }

    attachEventListeners() {
        this.elements.connectBtn.addEventListener('click', () => this.connectWallet());
        this.elements.disconnectBtn.addEventListener('click', () => this.disconnectWallet());
        this.elements.toggleBtn.addEventListener('click', () => this.toggleSniper());
        
        // Save settings when changed
        ['sellThreshold', 'buyAmount', 'slippage'].forEach(setting => {
            this.elements[setting].addEventListener('change', () => this.saveSettings());
        });
    }

    async connectWallet() {
        try {
            // Send message to content script to connect wallet
            const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
            
            const response = await chrome.tabs.sendMessage(tab.id, {
                action: 'connectWallet'
            });

            if (response && response.success) {
                this.handleWalletConnected(response.address, response.balance);
            } else {
                this.showError('Failed to connect wallet. Make sure Phantom is installed and unlocked.');
            }
        } catch (error) {
            console.error('Connection error:', error);
            this.showError('Error connecting to wallet: ' + error.message);
        }
    }

    async disconnectWallet() {
        try {
            const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
            
            await chrome.tabs.sendMessage(tab.id, {
                action: 'disconnectWallet'
            });

            this.handleWalletDisconnected();
        } catch (error) {
            console.error('Disconnect error:', error);
        }
    }

    handleWalletConnected(address, balance) {
        this.isConnected = true;
        this.walletAddress = address;

        this.elements.walletStatus.textContent = 'Wallet Connected';
        this.elements.walletStatus.className = 'status connected';
        
        this.elements.connectBtn.style.display = 'none';
        this.elements.disconnectBtn.style.display = 'block';
        this.elements.walletInfo.style.display = 'block';
        
        this.elements.walletAddress.textContent = this.formatAddress(address);
        this.elements.walletBalance.textContent = balance.toFixed(4);

        // Save connection state
        chrome.storage.local.set({
            walletConnected: true,
            walletAddress: address
        });
    }

    handleWalletDisconnected() {
        this.isConnected = false;
        this.walletAddress = null;
        this.isActive = false;

        this.elements.walletStatus.textContent = 'Wallet Disconnected';
        this.elements.walletStatus.className = 'status disconnected';
        
        this.elements.connectBtn.style.display = 'block';
        this.elements.disconnectBtn.style.display = 'none';
        this.elements.walletInfo.style.display = 'none';
        
        this.elements.toggleBtn.textContent = 'Start Dev Sniping';
        this.elements.toggleBtn.className = 'toggle-btn inactive';

        // Clear saved connection
        chrome.storage.local.remove(['walletConnected', 'walletAddress']);
    }

    async toggleSniper() {
        if (!this.isConnected) {
            this.showError('Please connect your wallet first');
            return;
        }

        this.isActive = !this.isActive;

        if (this.isActive) {
            await this.startSniper();
        } else {
            await this.stopSniper();
        }
    }

    async startSniper() {
        const settings = this.getSettings();
        
        try {
            const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
            
            const response = await chrome.tabs.sendMessage(tab.id, {
                action: 'startSniper',
                settings: settings
            });

            if (response && response.success) {
                this.elements.toggleBtn.textContent = 'Stop Dev Sniping';
                this.elements.toggleBtn.className = 'toggle-btn';
                
                // Save active state
                chrome.storage.local.set({ sniperActive: true });
            } else {
                this.showError('Failed to start sniper');
                this.isActive = false;
            }
        } catch (error) {
            console.error('Start sniper error:', error);
            this.showError('Error starting sniper: ' + error.message);
            this.isActive = false;
        }
    }

    async stopSniper() {
        try {
            const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
            
            await chrome.tabs.sendMessage(tab.id, {
                action: 'stopSniper'
            });

            this.elements.toggleBtn.textContent = 'Start Dev Sniping';
            this.elements.toggleBtn.className = 'toggle-btn inactive';
            
            // Save inactive state
            chrome.storage.local.set({ sniperActive: false });
        } catch (error) {
            console.error('Stop sniper error:', error);
        }
    }

    getSettings() {
        return {
            sellThreshold: parseInt(this.elements.sellThreshold.value),
            buyAmount: parseFloat(this.elements.buyAmount.value),
            slippage: parseInt(this.elements.slippage.value)
        };
    }

    saveSettings() {
        const settings = this.getSettings();
        chrome.storage.local.set({ sniperSettings: settings });
    }

    async loadSavedSettings() {
        try {
            const result = await chrome.storage.local.get(['sniperSettings']);
            if (result.sniperSettings) {
                const settings = result.sniperSettings;
                this.elements.sellThreshold.value = settings.sellThreshold || 10;
                this.elements.buyAmount.value = settings.buyAmount || 0.1;
                this.elements.slippage.value = settings.slippage || 10;
            }
        } catch (error) {
            console.error('Failed to load settings:', error);
        }
    }

    async checkWalletConnection() {
        try {
            const result = await chrome.storage.local.get(['walletConnected', 'walletAddress']);
            if (result.walletConnected && result.walletAddress) {
                // Try to reconnect
                const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
                
                const response = await chrome.tabs.sendMessage(tab.id, {
                    action: 'checkConnection'
                });

                if (response && response.connected) {
                    this.handleWalletConnected(response.address, response.balance);
                }
            }
        } catch (error) {
            console.error('Failed to check wallet connection:', error);
        }
    }

    formatAddress(address) {
        if (!address) return '';
        return `${address.slice(0, 4)}...${address.slice(-4)}`;
    }

    showError(message) {
        // Simple error display - could be enhanced with better UI
        console.error(message);
        alert(message); // Temporary - replace with better error handling
    }
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new DevSniperPopup();
});