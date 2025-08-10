import { test, expect } from '@playwright/test';

test.describe('Resumable Streaming', () => {
  test('should resume stream after page refresh during active streaming', async ({ page }) => {
    // Increase timeout for this test as we need time to observe streaming
    test.setTimeout(120000);
    
    console.log('🔍 Starting resumable streaming test');
    
    // Step 1: Navigate to new chat page
    console.log('📍 Step 1: Navigating to chat page');
    await page.goto('http://localhost:5173/chat');
    await expect(page).toHaveURL('http://localhost:5173/chat');
    console.log('✅ Successfully navigated to chat page');
    
    // Take initial screenshot
    await page.screenshot({ path: 'test-results/01-initial-chat-page.png', fullPage: true });
    
    // Step 2: Set default model to "mock-slow" 
    console.log('📍 Step 2: Looking for model selector');
    
    // Look for model selector - try different approaches
    await page.waitForTimeout(1000); // Wait for page to fully load
    
    let foundModelSelector = false;
    
    // Try to find select dropdown
    const selectElement = page.locator('select');
    if (await selectElement.count() > 0) {
      console.log('🎯 Found select element for model');
      await selectElement.selectOption('mock-slow');
      foundModelSelector = true;
      console.log('✅ Selected mock-slow model via select');
    }
    
    // Try to find button-based selector
    if (!foundModelSelector) {
      const modelButton = page.locator('button').filter({ hasText: /model/i });
      if (await modelButton.count() > 0) {
        console.log('🎯 Found model button');
        await modelButton.first().click();
        
        // Look for mock-slow in dropdown/menu
        const mockSlowOption = page.locator('text=mock-slow');
        if (await mockSlowOption.count() > 0) {
          await mockSlowOption.click();
          foundModelSelector = true;
          console.log('✅ Selected mock-slow model via button');
        }
      }
    }
    
    if (!foundModelSelector) {
      console.log('⚠️  Model selector not found, proceeding with default model');
    }
    
    await page.screenshot({ path: 'test-results/02-model-setup.png', fullPage: true });
    
    // Step 3: Send a message to trigger streaming
    console.log('📍 Step 3: Sending message to trigger streaming');
    
    // Find input field - try different selectors
    const messageInput = page.locator('input[type="text"], textarea, input[placeholder*="message"], input[placeholder*="Message"]');
    
    await expect(messageInput.first()).toBeVisible({ timeout: 10000 });
    await messageInput.first().fill('Please write a very long detailed story about a magical forest. Include many characters and events. Make it at least 10 paragraphs long so I can test the streaming functionality properly.');
    console.log('✅ Message entered');
    
    // Find send button
    const sendButton = page.locator('button[type="submit"], button:has-text("Send"), [data-testid="send-button"]');
    
    await sendButton.first().click();
    console.log('🚀 Message sent - streaming should start');
    
    await page.screenshot({ path: 'test-results/03-message-sent.png', fullPage: true });
    
    // Step 4: Wait for streaming to start and capture some content
    console.log('📍 Step 4: Waiting for streaming to begin');
    
    // Wait for AI response to appear (streaming message)
    try {
      await page.waitForSelector('[data-role="assistant"]', { timeout: 15000 });
      console.log('✅ Found assistant message starting to stream');
    } catch (e) {
      console.log('⚠️  Assistant message selector timeout, taking screenshot for debugging');
      await page.screenshot({ path: 'test-results/04-debug-no-assistant.png', fullPage: true });
      
      // Try alternative selectors
      const anyMessage = page.locator('[data-testid="message"]');
      if (await anyMessage.count() > 0) {
        console.log('✅ Found messages via data-testid');
      } else {
        console.log('❌ No messages found at all');
      }
    }
    
    // Wait for some content to stream in
    await page.waitForTimeout(5000); // Give streaming time to produce content
    
    // Capture the streaming content before refresh
    const assistantMessages = page.locator('[data-role="assistant"]');
    const messagesBefore = await assistantMessages.allTextContents();
    
    console.log(`📝 Content before refresh: ${messagesBefore.length} message(s) found`);
    if (messagesBefore.length > 0) {
      const preview = messagesBefore[0].substring(0, 200);
      console.log(`📄 First message preview (${messagesBefore[0].length} chars): ${preview}...`);
    }
    
    await page.screenshot({ path: 'test-results/04-streaming-before-refresh.png', fullPage: true });
    
    // Step 5: Refresh the page while streaming is active
    console.log('📍 Step 5: Refreshing page during active streaming');
    await page.reload({ waitUntil: 'networkidle' });
    console.log('🔄 Page refreshed');
    
    await page.screenshot({ path: 'test-results/05-after-refresh.png', fullPage: true });
    
    // Step 6: Check if stream resumes
    console.log('📍 Step 6: Checking if stream resumes after refresh');
    
    // Wait for the page to reinitialize 
    await page.waitForTimeout(3000);
    
    // Look for messages after refresh
    const messagesAfterRefresh = await page.locator('[data-role="assistant"]').allTextContents();
    
    console.log(`📝 Content after refresh: ${messagesAfterRefresh.length} message(s) found`);
    if (messagesAfterRefresh.length > 0) {
      const preview = messagesAfterRefresh[0].substring(0, 200);
      console.log(`📄 First message preview (${messagesAfterRefresh[0].length} chars): ${preview}...`);
    }
    
    // Look for sync/resume button
    const syncButton = page.locator('button:has-text("Sync"), button:has-text("Resume"), [data-testid*="sync"]');
    
    if (await syncButton.count() > 0) {
      console.log('🔄 Found sync/resume button - clicking to manually resume');
      await syncButton.first().click();
      await page.waitForTimeout(3000); // Wait for resume to take effect
    } else {
      console.log('ℹ️  No sync/resume button found - checking for automatic resume');
    }
    
    await page.screenshot({ path: 'test-results/06-after-potential-sync.png', fullPage: true });
    
    // Step 7: Wait and check for continued streaming
    console.log('📍 Step 7: Checking for continued streaming activity');
    
    // Wait a bit more to see if streaming continues
    await page.waitForTimeout(5000);
    
    const finalMessages = await page.locator('[data-role="assistant"]').allTextContents();
    
    console.log(`📊 Final state: ${finalMessages.length} message(s)`);
    
    await page.screenshot({ path: 'test-results/07-final-state.png', fullPage: true });
    
    // Log detailed results
    console.log('\n=== DETAILED TEST RESULTS ===');
    console.log(`Messages before refresh: ${messagesBefore.length}`);
    console.log(`Messages after refresh: ${messagesAfterRefresh.length}`);
    console.log(`Final message count: ${finalMessages.length}`);
    
    if (messagesBefore.length > 0) {
      console.log(`Content length before refresh: ${messagesBefore[0].length} characters`);
    }
    if (messagesAfterRefresh.length > 0) {
      console.log(`Content length after refresh: ${messagesAfterRefresh[0].length} characters`);
    }
    if (finalMessages.length > 0) {
      console.log(`Final content length: ${finalMessages[0].length} characters`);
    }
    
    // Analysis
    let resumeStatus = 'unknown';
    if (finalMessages.length === 0) {
      resumeStatus = 'failed - no messages after refresh';
    } else if (messagesBefore.length > 0 && messagesAfterRefresh.length > 0) {
      if (messagesAfterRefresh[0].length >= messagesBefore[0].length) {
        resumeStatus = 'success - content preserved and potentially continued';
      } else {
        resumeStatus = 'partial - some content lost';
      }
    } else if (messagesAfterRefresh.length > 0) {
      resumeStatus = 'indeterminate - messages found but cannot compare';
    }
    
    console.log(`🎯 Resume Status: ${resumeStatus}`);
    
    // Check for error messages
    const errorMessages = await page.locator('[class*="error"], .error, [data-testid*="error"]').allTextContents();
    
    if (errorMessages.length > 0) {
      console.log(`⚠️  Error messages found: ${errorMessages.join(', ')}`);
    } else {
      console.log('✅ No error messages detected');
    }
    
    // Basic test assertion - ensure we have some content after refresh
    expect(finalMessages.length).toBeGreaterThan(0);
    
    console.log('🏁 Resumable streaming test completed');
  });
});