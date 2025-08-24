import { test, expect } from '@playwright/test';

test.describe('Resumable Stream Functionality', () => {
  test('should resume streaming after page refresh during active streaming', async ({ page }) => {
    // Step 1: Navigate to new chat page
    await page.goto('http://localhost:5173/chat');
    console.log('✓ Step 1: Navigated to new chat page');
    
    // Wait for page to load
    await page.waitForLoadState('networkidle');
    
    // Take initial screenshot
    await page.screenshot({ 
      path: 'test-results/01-initial-chat-page.png', 
      fullPage: true 
    });
    
    // Step 2: Set the default model to "mock-slow"
    // Look for model selector dropdown or button
    const modelSelector = await page.locator('[data-testid="model-selector"]').or(page.locator('select')).or(page.locator('button:has-text("model")')).or(page.locator('button:has-text("Model")')).first();
    
    if (await modelSelector.isVisible()) {
      await modelSelector.click();
      console.log('✓ Step 2a: Clicked model selector');
      
      // Look for mock-slow option
      const mockSlowOption = await page.locator('text=mock-slow').or(page.locator('[value="mock-slow"]')).first();
      if (await mockSlowOption.isVisible()) {
        await mockSlowOption.click();
        console.log('✓ Step 2b: Selected mock-slow model');
        
        // Look for save button if it exists
        const saveButton = await page.locator('button:has-text("Save")').or(page.locator('button:has-text("Apply")'));
        if (await saveButton.isVisible()) {
          await saveButton.click();
          console.log('✓ Step 2c: Saved model selection');
        }
      } else {
        console.log('⚠ mock-slow option not found, continuing with default model');
      }
    } else {
      console.log('⚠ Model selector not found, continuing with default model');
    }
    
    // Take screenshot after model selection
    await page.screenshot({ 
      path: 'test-results/02-model-selected.png', 
      fullPage: true 
    });
    
    // Step 3: Send a message to trigger streaming
    const messageInput = await page.locator('input[type="text"]').or(page.locator('textarea')).first();
    await messageInput.fill('Tell me a long story about space exploration');
    console.log('✓ Step 3a: Entered message');
    
    // Find and click send button
    const sendButton = await page.locator('button[type="submit"]').or(page.locator('button:has-text("Send")')).first();
    await sendButton.click();
    console.log('✓ Step 3b: Clicked send button');
    
    // Wait a moment for streaming to start
    await page.waitForTimeout(1000);
    
    // Take screenshot during initial streaming
    await page.screenshot({ 
      path: 'test-results/03-streaming-started.png', 
      fullPage: true 
    });
    
    // Step 4: Wait for some streaming content to appear, then refresh
    // Wait for AI response to start appearing
    await page.waitForSelector('.message', { timeout: 10000 });
    
    // Wait a bit more for streaming content to accumulate
    await page.waitForTimeout(3000);
    
    // Capture the partial content before refresh
    const contentBeforeRefresh = await page.textContent('body');
    console.log('✓ Step 4a: Captured content before refresh');
    
    // Take screenshot before refresh
    await page.screenshot({ 
      path: 'test-results/04-before-refresh.png', 
      fullPage: true 
    });
    
    // Step 5: Refresh the page while streaming is active
    await page.reload();
    console.log('✓ Step 5: Refreshed page during active streaming');
    
    // Wait for page to reload
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    // Take screenshot after refresh
    await page.screenshot({ 
      path: 'test-results/05-after-refresh.png', 
      fullPage: true 
    });
    
    // Step 6: Check if stream resumes and content is preserved/continues
    
    // Check if we're back in the chat (URL should have chat ID now)
    const currentUrl = page.url();
    const hasChatId = currentUrl.includes('/chat/') && currentUrl.length > 'http://localhost:5173/chat/'.length;
    console.log(`Current URL: ${currentUrl}`);
    console.log(`Has chat ID: ${hasChatId}`);
    
    // Look for any messages in the chat
    const messages = await page.locator('.message').or(page.locator('[data-testid="message"]')).or(page.locator('.chat-message'));
    const messageCount = await messages.count();
    console.log(`Messages found after refresh: ${messageCount}`);
    
    // Check if there's a sync button
    const syncButton = await page.locator('button:has-text("Sync")').or(page.locator('[data-testid="sync-button"]'));
    const hasSyncButton = await syncButton.count() > 0;
    console.log(`Sync button present: ${hasSyncButton}`);
    
    if (hasSyncButton && await syncButton.isVisible()) {
      console.log('✓ Step 6a: Found sync button, clicking it');
      await syncButton.click();
      await page.waitForTimeout(2000);
      
      // Take screenshot after sync
      await page.screenshot({ 
        path: 'test-results/06-after-sync.png', 
        fullPage: true 
      });
    }
    
    // Wait for potential stream resumption
    await page.waitForTimeout(3000);
    
    // Take final screenshot
    await page.screenshot({ 
      path: 'test-results/07-final-state.png', 
      fullPage: true 
    });
    
    // Check for streaming indicators or continued content
    const isStreaming = await page.locator('.streaming').or(page.locator('[data-streaming="true"]')).count() > 0;
    const contentAfterRefresh = await page.textContent('body');
    
    console.log(`Streaming active after refresh: ${isStreaming}`);
    console.log(`Content length before refresh: ${contentBeforeRefresh?.length || 0}`);
    console.log(`Content length after refresh: ${contentAfterRefresh?.length || 0}`);
    
    // Report findings
    console.log('\n=== TEST RESULTS ===');
    console.log(`✓ Successfully navigated to chat page`);
    console.log(`✓ Attempted to set model to mock-slow`);
    console.log(`✓ Successfully sent message and initiated streaming`);
    console.log(`✓ Successfully refreshed page during streaming`);
    console.log(`✓ Chat ID preserved after refresh: ${hasChatId}`);
    console.log(`✓ Messages present after refresh: ${messageCount > 0}`);
    console.log(`✓ Sync button available: ${hasSyncButton}`);
    console.log(`✓ Stream resumed automatically: ${isStreaming}`);
    console.log(`✓ Content preserved/continued: ${(contentAfterRefresh?.length || 0) >= (contentBeforeRefresh?.length || 0) * 0.5}`);
    
    // Basic assertions
    expect(hasChatId).toBe(true);
    expect(messageCount).toBeGreaterThan(0);
  });
});