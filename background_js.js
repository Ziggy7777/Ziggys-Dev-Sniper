// Background service worker for the Chrome extension
class BackgroundService {
    constructor() {
        this.monitoringTabs = new Set();
        this.activeSnipes = new Map();
        
        this.setupEventListeners();
        console.log('Dev Sniper background service initialized');
    }
    
    setupEventListeners() {
        // Handle extension installation
        chrome.runtime.onInstalled.addListener((details) => {
            this.handleInstallation(details);
        });
        
        // Handle messages from content scripts
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            this.handleMessage(request, sender, sendResponse);
            return true; // Indicates we will send a response asynchronously
        });
        
        // Handle tab updates
        chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
            this.handleTabUpdate(tabId, changeInfo, tab);
        });
        
        // Handle tab removal
        chrome.tabs.onRemoved.addListener((tabId) => {
            this.handleTabRemoved(tabId);
        });
    }
    
    handleInstallation(details) {
        if (details.reason === 'install') {
            console.log('Extension installed for the first time');
            
            // Set default settings
            chrome.storage.local.set({
                sniperSettings: {
                    sellThreshold: 10,
                    buyAmount: 0.1,
                    slippage: 10
                },
                sniperActive: false,
                walletConnected: false
            });
            
            // Open getting started page (optional)
            // chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') });
        }
    }
    
    async handleMessage(request, sender, sendResponse) {
        try {
            switch (request.action) {
                case 'registerTab':
                    this.registerMonitoringTab(sender.tab.id);
                    sendResponse({ success: true });
                    break;
                    
                case 'unregisterTab':
                    this.unregisterMonitoringTab(sender.tab.id);
                    sendResponse({ success: true });
                    break;
                    
                case 'devSellDetected':
                    await this.handleDevSell(request.data, sender.tab.id);
                    sendResponse({ success: true });
                    break;
                    
                case 'executeBuyOrder':
                    const buyResult = await this.executeBuyOrder(request.data);
                    sendResponse(buyResult);
                    break;
                    
                case 'getActiveSnipes':
                    sendResponse({
                        success: true,
                        activeSnipes: Array.from(this.activeSnipes.entries())
                    });
                    break;
                    
                default:
                    sendResponse({ success: false, error: 'Unknown action' });
            }
        } catch (error) {
            console.error('Background script error:', error);
            sendResponse({ success: false, error: error.message });
        }
    }
    
    registerMonitoringTab(tabId) {
        this.monitoringTabs.add(tabId);
        console.log(`Registered monitoring tab: ${tabId}`);
    }
    
    unregisterMonitoringTab(tabId) {
        this.monitoringTabs.delete(tabId);
        
        // Clean up any active snipes for this tab
        for (const [snipeId, snipeData] of this.activeSnipes.entries()) {
            if (snipeData.tabId === tabId) {
                this.activeSnipes.delete(snipeId);
            }
        }
        
        console.log(`Unregistered monitoring tab: ${tabId}`);
    }
    
    handleTabUpdate(tabId, changeInfo, tab) {
        // Handle tab navigation - if user navigates away from Axiom, clean up
        if (changeInfo.url && this.monitoringTabs.has(tabId)) {
            if (!changeInfo.url.includes('axiom.trade')) {
                this.unregisterMonitoringTab(tabId);
            }
        }
    }
    
    handleTabRemoved(tabId) {
        this.unregisterMonitoringTab(tabId);
    }
    
    async handleDevSell(sellData, tabId) {
        const { tokenAddress, devWallet, sellPercentage, pairInfo } = sellData;
        
        console.log(`Dev sell detected: ${sellPercentage}% of ${tokenAddress}`);
        
        // Get user settings
        const settings = await this.getUserSettings();
        
        // Check if sell percentage meets threshold
        if (sellPercentage >= settings.sellThreshold) {
            console.log(`Threshold met (${sellPercentage}% >= ${settings.sellThreshold}%), executing buy order`);
            
            // Execute buy order
            await this.executeBuyOrder({
                tokenAddress,
                amount: settings.buyAmount,
                slippage: settings.slippage,
                tabId,
                trigger: 'dev_sell',
                sellPercentage
            });
        } else {
            console.log(`Threshold not met (${sellPercentage}% < ${settings.sellThreshold}%)`);
        }
    }
    
    async executeBuyOrder(buyData) {
        try {
            const { tokenAddress, amount, slippage, tabId } = buyData;
            
            // Create unique order ID
            const orderId = `buy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            
            // Store order info
            this.activeSnipes.set(orderId, {
                ...buyData,
                status: 'executing',
                timestamp: Date.now()
            });
            
            // Send execution request to content script
            const response = await chrome.tabs.sendMessage(tabId, {
                action: 'executeBuy',
                data: {
                    orderId,
                    tokenAddress,
                    amount,
                    slippage
                }
            });
            
            if (response && response.success) {
                // Update order status
                const order = this.activeSnipes.get(orderId);
                if (order) {
                    order.status = 'completed';
                    order.signature = response.signature;
                    order.completedAt = Date.now();
                }
                
                // Show notification
                this.showNotification({
                    type: 'success',
                    title: 'Buy Order Executed!',
                    message: `Successfully bought ${amount} SOL worth of tokens`,
                    signature: response.signature
                });
                
                return {
                    success: true,
                    orderId,
                    signature: response.signature
                };
            } else {
                // Update order status
                const order = this.activeSnipes.get(orderId);
                if (order) {
                    order.status = 'failed';
                    order.error = response.error;
                }
                
                this.showNotification({
                    type: 'error',
                    title: 'Buy Order Failed',
                    message: response.error || 'Unknown error occurred'
                });
                
                return {
                    success: false,
                    error: response.error
                };
            }
            
        } catch (error) {
            console.error('Error executing buy order:', error);
            
            this.showNotification({
                type: 'error',
                title: 'Buy Order Error',
                message: error.message
            });
            
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    async getUserSettings() {
        try {
            const result = await chrome.storage.local.get(['sniperSettings']);
            return result.sniperSettings || {
                sellThreshold: 10,
                buyAmount: 0.1,
                slippage: 10
            };
        } catch (error) {
            console.error('Error getting user settings:', error);
            return {
                sellThreshold: 10,
                buyAmount: 0.1,
                slippage: 10
            };
        }
    }
    
    showNotification(notificationData) {
        const { type, title, message, signature } = notificationData;
        
        // Create notification
        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon48.png',
            title: title,
            message: message,
            contextMessage: signature ? `TX: ${signature}` : undefined
        });
        
        // Also log to console for debugging
        console.log(`Notification [${type}]: ${title} - ${message}`);
    }
    
    // Cleanup method for when extension is disabled/uninstalled
    cleanup() {
        this.monitoringTabs.clear();
        this.activeSnipes.clear();
        console.log('Background service cleaned up');
    }
}

// Initialize background service
const backgroundService = new BackgroundService();

// Handle extension lifecycle
chrome.runtime.onSuspend.addListener(() => {
    backgroundService.cleanup();
});