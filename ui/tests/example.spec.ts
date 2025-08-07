import { test, expect } from '@playwright/test';

test('homepage loads correctly', async ({ page }) => {
  await page.goto('/');
  
  // Check that the page loads
  await expect(page).toHaveTitle(/Tea4Chat/);
  
  // Check for main content
  await expect(page.locator('text=Welcome')).toBeVisible();
});

test('can navigate to chat page', async ({ page }) => {
  await page.goto('/');
  
  // Click on chat link/button (adjust selector based on your UI)
  await page.click('text=Chat');
  
  // Verify we're on the chat page
  await expect(page.url()).toContain('/chat');
});

test('chat interface loads', async ({ page }) => {
  await page.goto('/chat');
  
  // Check that chat interface elements are present
  await expect(page.locator('[data-testid="chat-input"]')).toBeVisible();
  await expect(page.locator('[data-testid="send-button"]')).toBeVisible();
});